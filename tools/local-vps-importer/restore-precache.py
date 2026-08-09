from __future__ import annotations

import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from app import (
    CACHE_ROOT,
    DEFAULT_API_BASE,
    DEFAULT_API_KEY,
    ImportConfig,
    import_songs_to_catalog,
    login_admin_from_remote,
    upload_entries,
    upsert_global_playlist,
)


SSH_KEY = str(Path.home() / ".ssh" / "barbershop_vps_ed25519")
PUBLISHED_PLAYLISTS = {
    "37i9dQZEVXbMDoHDwVN2tF",
    "37i9dQZEVXbMXbN3EUUhlg",
    "37i9dQZF1DX0FOF1IUWK1W",
    "mc-mn-hits-20260801",
}

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    config = ImportConfig(
        ssh_host="38.18.230.83",
        ssh_port=22,
        ssh_user="root",
        ssh_password="",
        ssh_key_path=SSH_KEY,
        api_base=DEFAULT_API_BASE,
        app_username="",
        app_password="",
        spotify_url="",
        create_personal_playlist=False,
        create_global_playlist=True,
    )
    if not Path(SSH_KEY).is_file():
        raise FileNotFoundError(f"Chave SSH ausente: {SSH_KEY}")

    sources: list[tuple[Path, dict[str, Any], list[dict[str, Any]]]] = []
    unique_entries: dict[str, dict[str, Any]] = {}
    source_locations: dict[str, Path] = {}

    for manifest_path in sorted(CACHE_ROOT.glob("*/manifest.json")):
        directory = manifest_path.parent
        entries = [
            entry
            for entry in load_json(manifest_path)
            if entry.get("sourceId")
            and entry.get("fileName")
            and (directory / entry["fileName"]).is_file()
        ]
        if not entries:
            continue
        selection_path = directory / "current-selection.json"
        if selection_path.is_file():
            playlist = load_json(selection_path)
        else:
            playlist = {
                "spotifyId": directory.name,
                "name": directory.name,
                "coverUrl": entries[0].get("coverUrl") or "",
            }
        sources.append((directory, playlist, entries))
        for entry in entries:
            source_id = str(entry["sourceId"])
            unique_entries.setdefault(source_id, entry)
            source_locations.setdefault(source_id, directory)

    print(f"Restaurando {len(unique_entries)} audios de {len(sources)} manifestos.", flush=True)
    if "--playlists-only" in sys.argv:
        admin_token = login_admin_from_remote(config, DEFAULT_API_KEY)
        for _directory, playlist, entries in sources:
            playlist_id = str(playlist.get("spotifyId") or "")
            if playlist_id not in PUBLISHED_PLAYLISTS:
                continue
            song_ids = import_songs_to_catalog(
                config,
                entries,
                DEFAULT_API_KEY,
                admin_token,
                print,
            )
            upsert_global_playlist(
                config,
                playlist,
                entries,
                song_ids,
                DEFAULT_API_KEY,
                admin_token,
                print,
            )
        print("Playlists globais restauradas.", flush=True)
        return 0

    upload_groups: dict[Path, list[dict[str, Any]]] = {}
    for source_id, entry in unique_entries.items():
        upload_groups.setdefault(source_locations[source_id], []).append(entry)

    api_key = ""
    with ThreadPoolExecutor(max_workers=4, thread_name_prefix="precache-restore") as executor:
        futures = {
            executor.submit(upload_entries, config, directory, entries, print): directory
            for directory, entries in upload_groups.items()
        }
        for index, future in enumerate(as_completed(futures), start=1):
            directory = futures[future]
            api_key = future.result() or api_key
            print(f"[{index}/{len(futures)}] Upload concluido: {directory.name}", flush=True)

    if not api_key:
        raise RuntimeError("Nenhum manifesto valido foi encontrado.")
    admin_token = login_admin_from_remote(config, api_key)
    source_to_song_id: dict[str, int] = {}
    ordered = list(unique_entries.values())
    for offset in range(0, len(ordered), 100):
        batch = ordered[offset : offset + 100]
        ids = import_songs_to_catalog(config, batch, api_key, admin_token, print)
        source_to_song_id.update(
            {str(entry["sourceId"]): song_id for entry, song_id in zip(batch, ids)}
        )

    for _directory, playlist, entries in sources:
        playlist_id = str(playlist.get("spotifyId") or "")
        if playlist_id not in PUBLISHED_PLAYLISTS:
            continue
        playlist_entries = [
            entry for entry in entries if str(entry["sourceId"]) in source_to_song_id
        ]
        song_ids = [source_to_song_id[str(entry["sourceId"])] for entry in playlist_entries]
        upsert_global_playlist(
            config,
            playlist,
            playlist_entries,
            song_ids,
            api_key,
            admin_token,
            print,
        )

    print(f"Restauracao concluida: {len(source_to_song_id)} musicas no catalogo.", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Restauracao interrompida; pode ser retomada sem duplicar arquivos.", file=sys.stderr)
        raise SystemExit(130)
