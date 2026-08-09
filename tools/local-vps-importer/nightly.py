from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sqlite3
import sys
import time
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
DEFAULT_CONFIG = HERE / "automation.json"
DEFAULT_STATE = REPO_ROOT / ".local-precache" / "automation-state.sqlite3"
LOCK_PATH = REPO_ROOT / ".local-precache" / "automation.lock"


@dataclass(frozen=True)
class Source:
    name: str
    url: str
    publish_playlist: bool


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("A configuracao precisa ser um objeto JSON.")
    return data


def enabled_sources(config: dict[str, Any]) -> list[Source]:
    result: list[Source] = []
    for raw in config.get("sources", []):
        if not isinstance(raw, dict) or raw.get("enabled", True) is False:
            continue
        name = str(raw.get("name") or "Fonte Spotify").strip()
        url = str(raw.get("url") or "").strip()
        if not url:
            raise ValueError(f"A fonte '{name}' nao tem URL.")
        result.append(Source(name, url, bool(raw.get("publishPlaylist", False))))
    if not result:
        raise ValueError("Nenhuma fonte habilitada em 'sources'.")
    return result


def open_state(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.executescript(
        """
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS tracks (
            spotify_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            source_name TEXT NOT NULL,
            source_url TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'seen',
            attempts INTEGER NOT NULL DEFAULT 0,
            first_seen_at TEXT NOT NULL,
            processed_at TEXT,
            source_id TEXT,
            last_error TEXT
        );
        CREATE TABLE IF NOT EXISTS runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            status TEXT NOT NULL,
            imported INTEGER NOT NULL DEFAULT 0,
            error TEXT
        );
        """
    )
    db.commit()
    return db


def remember_tracks(db: sqlite3.Connection, source: Source, tracks: list[dict[str, Any]]) -> None:
    stamp = now_iso()
    db.executemany(
        """
        INSERT INTO tracks
            (spotify_id, title, artist, source_name, source_url, first_seen_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(spotify_id) DO UPDATE SET
            title = excluded.title,
            artist = excluded.artist
        """,
        [
            (
                str(track["spotifyId"]),
                str(track.get("title") or track["spotifyId"]),
                str(track.get("artist") or ""),
                source.name,
                source.url,
                stamp,
            )
            for track in tracks
            if track.get("spotifyId")
        ],
    )
    db.commit()


def select_candidates(
    db: sqlite3.Connection,
    tracks: list[dict[str, Any]],
    limit: int,
    max_retries: int,
    reserved: set[str],
) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    for track in tracks:
        spotify_id = str(track.get("spotifyId") or "")
        if not spotify_id or spotify_id in reserved:
            continue
        row = db.execute(
            "SELECT status, attempts FROM tracks WHERE spotify_id = ?", (spotify_id,)
        ).fetchone()
        if row and row["status"] != "done" and int(row["attempts"]) < max_retries:
            selected.append(track)
            reserved.add(spotify_id)
        if len(selected) >= limit:
            break
    return selected


def mark_result(
    db: sqlite3.Connection,
    selected: list[dict[str, Any]],
    imported_ids: set[str],
    source_ids: dict[str, str] | None = None,
    error: str = "",
) -> None:
    source_ids = source_ids or {}
    stamp = now_iso()
    for track in selected:
        spotify_id = str(track["spotifyId"])
        if spotify_id in imported_ids:
            db.execute(
                """
                UPDATE tracks SET status = 'done', attempts = attempts + 1,
                    processed_at = ?, source_id = ?, last_error = NULL
                WHERE spotify_id = ?
                """,
                (stamp, source_ids.get(spotify_id), spotify_id),
            )
        else:
            db.execute(
                """
                UPDATE tracks SET status = 'failed', attempts = attempts + 1,
                    last_error = ? WHERE spotify_id = ?
                """,
                ((error or "O download nao produziu um arquivo valido")[:2000], spotify_id),
            )
    db.commit()


@contextmanager
def single_instance(lock_path: Path) -> Iterator[None]:
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as exc:
        raise RuntimeError(
            f"A automacao parece ja estar rodando. Se nao estiver, apague {lock_path}."
        ) from exc
    try:
        os.write(descriptor, f"pid={os.getpid()} started={now_iso()}\n".encode("utf-8"))
        os.close(descriptor)
        yield
    finally:
        try:
            lock_path.unlink()
        except FileNotFoundError:
            pass


def load_importer():
    spec = importlib.util.spec_from_file_location("nationmusics_local_importer", HERE / "app.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("Nao foi possivel carregar app.py.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def log(message: str) -> None:
    print(time.strftime("%H:%M:%S") + " " + message, flush=True)


def run(
    config_path: Path,
    state_path: Path,
    dry_run: bool = False,
    *,
    config_override: dict[str, Any] | None = None,
    ssh_password: str = "",
    should_stop=None,
    logger=log,
) -> int:
    raw = config_override or load_json(config_path)
    sources = enabled_sources(raw)
    max_total = max(1, int(raw.get("maxTracksPerRun", 100)))
    max_source = max(1, int(raw.get("maxTracksPerSource", 25)))
    max_retries = max(1, int(raw.get("maxRetries", 3)))
    read_limit = min(200, max(max_source, int(raw.get("spotifyReadLimit", 100))))
    deadline = time.monotonic() + max(1, int(raw.get("maxRuntimeMinutes", 480))) * 60
    importer = load_importer()
    db = open_state(state_path)
    run_id = db.execute(
        "INSERT INTO runs (started_at, status) VALUES (?, 'running')", (now_iso(),)
    ).lastrowid
    db.commit()
    imported_total = 0
    reserved: set[str] = set()

    try:
        for source in sources:
            if (
                imported_total >= max_total
                or time.monotonic() >= deadline
                or (should_stop is not None and should_stop())
            ):
                break
            logger(f"Lendo fonte: {source.name}")
            playlist = importer.run_json_script(
                importer.DEPLOY_DIR / "spotify_playlist.py",
                [source.url, str(read_limit)],
                logger,
            )
            tracks = [track for track in playlist.get("tracks", []) if isinstance(track, dict)]
            remember_tracks(db, source, tracks)
            batch_limit = min(max_source, max_total - imported_total)
            selected = select_candidates(db, tracks, batch_limit, max_retries, reserved)
            if not selected:
                logger(f"{source.name}: nenhuma musica nova.")
                continue
            logger(f"{source.name}: lote de {len(selected)} musica(s).")
            if dry_run:
                for track in selected:
                    logger(f"  [simulacao] {track.get('artist')} - {track.get('title')}")
                imported_total += len(selected)
                continue

            batch_playlist = dict(playlist)
            batch_playlist["tracks"] = selected
            batch_playlist["totalTracks"] = len(selected)
            batch_playlist["truncated"] = False
            import_config = importer.parse_config(
                {
                    "sshHost": raw.get("sshHost"),
                    "sshPort": raw.get("sshPort"),
                    "sshUser": raw.get("sshUser"),
                    "sshPassword": ssh_password or os.environ.get("NATIONMUSICS_SSH_PASSWORD", ""),
                    "sshKeyPath": raw.get("sshKeyPath") or os.environ.get("NATIONMUSICS_SSH_KEY_PATH", ""),
                    "apiBase": raw.get("apiBase"),
                    "spotifyUrl": source.url,
                    "createPersonalPlaylist": False,
                    "createGlobalPlaylist": source.publish_playlist,
                    "sleepSeconds": raw.get("sleepSeconds", 8),
                    "limit": read_limit,
                }
            )
            try:
                result = importer.run_import(import_config, logger, playlist_override=batch_playlist)
                imported_ids = {str(item) for item in result.get("spotifyTrackIds", [])}
                mark_result(db, selected, imported_ids)
                imported_total += len(imported_ids)
                failed = len(selected) - len(imported_ids)
                logger(f"{source.name}: {len(imported_ids)} importada(s), {failed} falha(s).")
            except Exception as exc:
                mark_result(db, selected, set(), error=str(exc))
                logger(f"ERRO em {source.name}: {exc}")

        status = "dry-run" if dry_run else "done"
        db.execute(
            "UPDATE runs SET finished_at = ?, status = ?, imported = ? WHERE id = ?",
            (now_iso(), status, imported_total, run_id),
        )
        db.commit()
        logger(f"Fim: {imported_total} musica(s) {'selecionada(s)' if dry_run else 'importada(s)' }.")
        return 0
    except Exception as exc:
        db.execute(
            "UPDATE runs SET finished_at = ?, status = 'error', imported = ?, error = ? WHERE id = ?",
            (now_iso(), imported_total, str(exc)[:2000], run_id),
        )
        db.commit()
        raise
    finally:
        db.close()


def status(state_path: Path) -> None:
    db = open_state(state_path)
    try:
        counts = db.execute(
            "SELECT status, COUNT(*) AS amount FROM tracks GROUP BY status ORDER BY status"
        ).fetchall()
        print("Estado das musicas:")
        for row in counts:
            print(f"  {row['status']}: {row['amount']}")
        print("\nUltimas execucoes:")
        for row in db.execute(
            "SELECT started_at, finished_at, status, imported, error FROM runs ORDER BY id DESC LIMIT 10"
        ):
            print(
                f"  {row['started_at']} | {row['status']} | {row['imported']} importada(s)"
                + (f" | {row['error']}" if row["error"] else "")
            )
    finally:
        db.close()


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    parser = argparse.ArgumentParser(description="Importacao noturna e incremental do NationMusics")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    parser.add_argument("--dry-run", action="store_true", help="Descobre e lista sem baixar")
    parser.add_argument("--status", action="store_true", help="Mostra o historico local")
    args = parser.parse_args()
    if args.status:
        status(args.state.resolve())
        return
    if not args.config.is_file():
        raise SystemExit(
            f"Configuracao nao encontrada: {args.config}\n"
            f"Copie automation.example.json para automation.json e ajuste as fontes."
        )
    config_path = args.config.resolve()
    raw = load_json(config_path)
    with single_instance(LOCK_PATH):
        if not bool(raw.get("continuous", False)) or args.dry_run:
            raise SystemExit(run(config_path, args.state.resolve(), args.dry_run))
        cycle = 0
        try:
            while True:
                cycle += 1
                log(f"Ciclo continuo {cycle}: procurando novidades.")
                run(config_path, args.state.resolve(), False)
                delay_minutes = max(2, int(raw.get("cycleDelayMinutes", 10)))
                log(f"Nova verificacao em {delay_minutes} minuto(s).")
                time.sleep(delay_minutes * 60)
        except KeyboardInterrupt:
            log("Automacao encerrada pelo usuario.")


if __name__ == "__main__":
    main()
