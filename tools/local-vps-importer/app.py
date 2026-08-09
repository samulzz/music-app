from __future__ import annotations

import argparse
import json
import os
import posixpath
import queue
import shlex
import shutil
import site
import socket
import subprocess
import sys
import sysconfig
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import paramiko
import nightly as automation


REPO_ROOT = Path(__file__).resolve().parents[2]
DEPLOY_DIR = REPO_ROOT / "deploy-test"
CACHE_ROOT = REPO_ROOT / ".local-precache"
DEFAULT_API_BASE = "https://marlonbarbershop.com/nationmusics/api"
DEFAULT_API_KEY = "REDACTED_API_KEY"
DEFAULT_REMOTE_PROJECT = "/opt/nationmusics-test"
DEFAULT_VOLUME_NAME = "nationmusics-test-downloads"
DEFAULT_CONTAINER_USER = "10001:10001"


class ImportErrorWithDetails(RuntimeError):
    pass


@dataclass
class ImportConfig:
    ssh_host: str
    ssh_port: int
    ssh_user: str
    ssh_password: str
    ssh_key_path: str
    api_base: str
    app_username: str
    app_password: str
    spotify_url: str
    create_personal_playlist: bool = True
    create_global_playlist: bool = False
    sleep_seconds: float = 2.0
    limit: int = 200


class Job:
    def __init__(self, config: ImportConfig):
        self.config = config
        self.id = str(int(time.time() * 1000))
        self.status = "running"
        self.logs: list[str] = []
        self.result: dict[str, Any] | None = None
        self.error: str | None = None
        self.started_at = time.time()
        self.finished_at: float | None = None
        self.lock = threading.Lock()

    def log(self, message: str) -> None:
        line = time.strftime("%H:%M:%S") + " " + message
        with self.lock:
            self.logs.append(line)
            self.logs = self.logs[-1200:]
        print(line, flush=True)

    def finish(self, result: dict[str, Any]) -> None:
        with self.lock:
            self.status = "done"
            self.result = result
            self.finished_at = time.time()

    def fail(self, error: Exception) -> None:
        with self.lock:
            self.status = "error"
            self.error = str(error)
            self.finished_at = time.time()

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            return {
                "id": self.id,
                "status": self.status,
                "logs": list(self.logs),
                "result": self.result,
                "error": self.error,
                "startedAt": self.started_at,
                "finishedAt": self.finished_at,
            }


JOBS: dict[str, Job] = {}
JOBS_LOCK = threading.Lock()


class AutomationJob:
    def __init__(self, config: dict[str, Any], ssh_password: str):
        self.config = config
        self.ssh_password = ssh_password
        self.status = "running"
        self.logs: list[str] = []
        self.error: str | None = None
        self.started_at = time.time()
        self.finished_at: float | None = None
        self.stop_event = threading.Event()
        self.lock = threading.Lock()

    def log(self, message: str) -> None:
        line = time.strftime("%H:%M:%S") + " " + message
        with self.lock:
            self.logs.append(line)
            self.logs = self.logs[-1500:]
        print(line, flush=True)

    def request_stop(self) -> None:
        self.stop_event.set()
        with self.lock:
            if self.status == "running":
                self.status = "stopping"
        self.log("Parada solicitada. O lote atual sera finalizado com seguranca.")

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            return {
                "status": self.status,
                "logs": list(self.logs),
                "error": self.error,
                "startedAt": self.started_at,
                "finishedAt": self.finished_at,
            }


AUTO_JOB: AutomationJob | None = None
AUTO_JOB_LOCK = threading.Lock()


def as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "sim", "on"}


def parse_config(data: dict[str, Any]) -> ImportConfig:
    ssh_password = str(data.get("sshPassword") or os.environ.get("NATIONMUSICS_SSH_PASSWORD") or "")
    ssh_key_path = str(data.get("sshKeyPath") or os.environ.get("NATIONMUSICS_SSH_KEY_PATH") or "").strip()
    if ssh_key_path:
        ssh_key_path = str(Path(ssh_key_path).expanduser().resolve())
    app_password = str(data.get("appPassword") or os.environ.get("NATIONMUSICS_APP_PASSWORD") or "")
    config = ImportConfig(
        ssh_host=str(data.get("sshHost") or os.environ.get("NATIONMUSICS_SSH_HOST") or "38.18.230.83").strip(),
        ssh_port=int(data.get("sshPort") or os.environ.get("NATIONMUSICS_SSH_PORT") or 22),
        ssh_user=str(data.get("sshUser") or os.environ.get("NATIONMUSICS_SSH_USER") or "root").strip(),
        ssh_password=ssh_password,
        ssh_key_path=ssh_key_path,
        api_base=str(data.get("apiBase") or os.environ.get("NATIONMUSICS_API_BASE") or DEFAULT_API_BASE).strip(),
        app_username=str(data.get("appUsername") or "").strip(),
        app_password=app_password,
        spotify_url=str(data.get("spotifyUrl") or "").strip(),
        create_personal_playlist=as_bool(data.get("createPersonalPlaylist"), True),
        create_global_playlist=as_bool(data.get("createGlobalPlaylist"), False),
        sleep_seconds=float(data.get("sleepSeconds") or 2),
        limit=int(data.get("limit") or 200),
    )
    if not config.ssh_host:
        raise ValueError("SSH host nao informado.")
    if not config.ssh_user:
        raise ValueError("SSH user nao informado.")
    if not config.ssh_password and not config.ssh_key_path:
        raise ValueError("Informe a senha SSH ou o caminho de uma chave privada.")
    if config.ssh_key_path and not Path(config.ssh_key_path).is_file():
        raise ValueError(f"Chave SSH nao encontrada: {config.ssh_key_path}")
    if config.create_personal_playlist and not config.app_username:
        raise ValueError("Usuario do app nao informado.")
    if config.create_personal_playlist and not config.app_password:
        raise ValueError("Senha do usuario do app nao informada.")
    if not config.spotify_url:
        raise ValueError("Link do Spotify nao informado.")
    return config


def connect_ssh(config: ImportConfig) -> paramiko.SSHClient:
    last_error: Exception | None = None
    for attempt in range(1, 6):
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            client.connect(
                config.ssh_host,
                config.ssh_port,
                config.ssh_user,
                password=config.ssh_password or None,
                key_filename=config.ssh_key_path or None,
                look_for_keys=True,
                allow_agent=True,
                timeout=30,
                banner_timeout=45,
                auth_timeout=30,
            )
            transport = client.get_transport()
            if transport is not None:
                transport.set_keepalive(20)
            return client
        except Exception as error:
            last_error = error
            try:
                client.close()
            except Exception:
                pass
            if attempt < 5:
                time.sleep(min(20, attempt * 4))
    raise ImportErrorWithDetails(f"Falha ao conectar via SSH depois de varias tentativas: {last_error}")


def ssh_exec(client: paramiko.SSHClient, command: str, timeout: int = 120) -> str:
    stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise ImportErrorWithDetails((err or out or command).strip())
    return out


class PotTunnel:
    def __init__(self, config: ImportConfig, log):
        self.config = config
        self.log = log
        self.client: paramiko.SSHClient | None = None
        self.transport = None
        self.server: socket.socket | None = None
        self.local_port = 0
        self._stop = threading.Event()
        self._threads: list[threading.Thread] = []

    def __enter__(self) -> "PotTunnel":
        self.client = connect_ssh(self.config)
        remote_ip = ssh_exec(
            self.client,
            "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "
            "nationmusics-test-pot-provider",
            timeout=30,
        ).strip()
        if not remote_ip:
            raise ImportErrorWithDetails("Nao consegui encontrar o IP do pot-provider na VPS.")
        self.transport = self.client.get_transport()
        self.server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server.bind(("127.0.0.1", 0))
        self.server.listen(50)
        self.local_port = int(self.server.getsockname()[1])
        thread = threading.Thread(target=self._accept_loop, args=(remote_ip,), daemon=True)
        thread.start()
        self._threads.append(thread)
        self.log(f"PO Token local: http://127.0.0.1:{self.local_port} -> {remote_ip}:4416")
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self._stop.set()
        if self.server:
            try:
                self.server.close()
            except OSError:
                pass
        if self.client:
            self.client.close()

    def _accept_loop(self, remote_ip: str) -> None:
        assert self.server is not None
        while not self._stop.is_set():
            try:
                sock, addr = self.server.accept()
            except OSError:
                break
            try:
                chan = self.transport.open_channel("direct-tcpip", (remote_ip, 4416), addr)
            except Exception:
                sock.close()
                continue
            thread = threading.Thread(target=self._pipe, args=(sock, chan), daemon=True)
            thread.start()
            self._threads.append(thread)

    @staticmethod
    def _pipe(sock: socket.socket, chan) -> None:
        try:
            while True:
                readable, _, _ = select_sockets(sock, chan)
                if sock in readable:
                    data = sock.recv(32768)
                    if not data:
                        break
                    chan.sendall(data)
                if chan in readable:
                    data = chan.recv(32768)
                    if not data:
                        break
                    sock.sendall(data)
        except Exception:
            pass
        finally:
            try:
                chan.close()
            except Exception:
                pass
            try:
                sock.close()
            except Exception:
                pass


def select_sockets(sock: socket.socket, chan):
    import select

    return select.select([sock, chan], [], [], 1)


def run_json_script(script: Path, args: list[str], log) -> dict[str, Any]:
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    command = [sys.executable, str(script), *args]
    log("Lendo dados do Spotify...")
    result = subprocess.run(
        command,
        cwd=str(REPO_ROOT),
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=90,
    )
    if result.returncode != 0:
        raise ImportErrorWithDetails((result.stderr or result.stdout).strip())
    data = json.loads(result.stdout)
    if "error" in data:
        raise ImportErrorWithDetails(str(data["error"]))
    return data


def find_python_ytdlp() -> Path:
    scripts = Path(sysconfig.get_path("scripts") or "")
    user_site = Path(site.getusersitepackages())
    user_scripts = user_site.parent / ("Scripts" if os.name == "nt" else "bin")
    name = "yt-dlp.exe" if os.name == "nt" else "yt-dlp"
    candidates = [
        user_scripts / name,
        scripts / name,
        Path(os.environ.get("YT_DLP_PATH", "")),
        Path(shutil.which("yt-dlp") or ""),
        Path("D:/dev/utils/yt-dlp.exe"),
    ]
    for candidate in candidates:
        if str(candidate) and candidate.is_file():
            return candidate
    raise ImportErrorWithDetails(
        "yt-dlp nao encontrado. Rode: python -m pip install --user -r tools/local-vps-importer/requirements.txt"
    )


def find_ffmpeg_dir() -> Path:
    configured = os.environ.get("FFMPEG_PATH", "").strip()
    if configured and Path(configured).exists():
        return Path(configured)
    local = Path("D:/dev/utils")
    if (local / "ffmpeg.exe").is_file() or (local / "ffmpeg").is_file():
        return local
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        return Path(ffmpeg).parent
    raise ImportErrorWithDetails("ffmpeg nao encontrado em D:/dev/utils nem no PATH.")


def user_site_packages() -> str:
    result = subprocess.run(
        [sys.executable, "-c", "import site; print(site.getusersitepackages())"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=True,
    )
    return result.stdout.strip()


def precache_playlist(config: ImportConfig, playlist: dict[str, Any], pot_url: str, log) -> tuple[Path, list[dict[str, Any]]]:
    spotify_id = playlist["spotifyId"]
    output_dir = CACHE_ROOT / spotify_id
    output_dir.mkdir(parents=True, exist_ok=True)
    yt_dlp = find_python_ytdlp()
    ffmpeg_dir = find_ffmpeg_dir()
    manifest_path = output_dir / "manifest.json"
    selection_path = output_dir / "current-selection.json"
    selection_path.write_text(json.dumps(playlist, ensure_ascii=False, indent=2), encoding="utf-8")
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PRECACHE_SLEEP_SECONDS"] = str(config.sleep_seconds)
    env["YT_DLP_JS_RUNTIME"] = "node"
    env["YT_DLP_POT_PROVIDER_URL"] = pot_url
    env["YT_DLP_PLUGIN_DIRS"] = user_site_packages()

    command = [
        sys.executable,
        str(DEPLOY_DIR / "precache_spotify_playlist.py"),
        config.spotify_url,
        str(output_dir),
        str(yt_dlp),
        str(ffmpeg_dir),
        str(selection_path),
    ]
    log(f"Pre-baixando {len(playlist.get('tracks', []))} faixa(s) pelo computador local...")
    process = subprocess.Popen(
        command,
        cwd=str(REPO_ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )
    assert process.stdout is not None
    for line in process.stdout:
        line = line.strip()
        if line:
            log(line)
    code = process.wait()
    if code != 0:
        raise ImportErrorWithDetails(f"precache_spotify_playlist.py terminou com codigo {code}.")
    if not manifest_path.is_file():
        raise ImportErrorWithDetails("Manifesto local nao foi criado.")
    entries = json.loads(manifest_path.read_text(encoding="utf-8"))
    selected_spotify_ids = {
        str(track.get("spotifyId"))
        for track in playlist.get("tracks", [])
        if track.get("spotifyId")
    }
    valid = [
        entry
        for entry in entries
        if entry.get("sourceId")
        and entry.get("fileName")
        and str(entry.get("spotifyId")) in selected_spotify_ids
    ]
    if not valid:
        raise ImportErrorWithDetails("Nenhuma musica foi pre-baixada com sucesso.")
    return output_dir, valid


def remote_env_value(client: paramiko.SSHClient, key: str, default: str = "") -> str:
    command = (
        f"cd {shlex.quote(DEFAULT_REMOTE_PROJECT)} 2>/dev/null && "
        f"grep -E '^{shlex.quote(key)}=' .env | tail -n 1 | cut -d= -f2-"
    )
    try:
        value = ssh_exec(client, command, timeout=30).strip()
    except Exception:
        return default
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1]
    return value or default


def upload_entries(config: ImportConfig, output_dir: Path, entries: list[dict[str, Any]], log) -> str:
    client = connect_ssh(config)
    sftp = None
    try:
        mount = ssh_exec(
            client,
            f"docker volume inspect {shlex.quote(DEFAULT_VOLUME_NAME)} -f '{{{{ .Mountpoint }}}}'",
            timeout=30,
        ).strip()
        if not mount.startswith("/"):
            raise ImportErrorWithDetails("Mountpoint do volume de downloads nao foi encontrado.")

        def reconnect() -> None:
            nonlocal client, sftp
            try:
                if sftp is not None:
                    sftp.close()
            except Exception:
                pass
            try:
                client.close()
            except Exception:
                pass
            client = connect_ssh(config)
            sftp = client.open_sftp()

        sftp = client.open_sftp()
        uploaded = 0
        skipped = 0
        touched: list[str] = []
        for index, entry in enumerate(entries, start=1):
            file_name = entry["fileName"]
            local_path = output_dir / file_name
            if not local_path.is_file():
                raise ImportErrorWithDetails(f"Arquivo local ausente: {local_path}")
            remote_path = posixpath.join(mount, file_name)
            for attempt in range(1, 4):
                try:
                    same_size = False
                    try:
                        same_size = sftp.stat(remote_path).st_size == local_path.stat().st_size
                    except FileNotFoundError:
                        same_size = False
                    if same_size:
                        skipped += 1
                        log(f"[{index}/{len(entries)}] ja existe na VPS: {file_name}")
                    else:
                        tmp_path = remote_path + ".uploading"
                        log(f"[{index}/{len(entries)}] enviando para VPS: {file_name}")
                        try:
                            sftp.remove(tmp_path)
                        except FileNotFoundError:
                            pass
                        sftp.put(str(local_path), tmp_path)
                        ssh_exec(
                            client,
                            "set -e; "
                            f"mv -f {shlex.quote(tmp_path)} {shlex.quote(remote_path)}; "
                            f"chown {DEFAULT_CONTAINER_USER} {shlex.quote(remote_path)}; "
                            f"chmod 0644 {shlex.quote(remote_path)}",
                            timeout=60,
                        )
                        uploaded += 1
                    touched.append(remote_path)
                    break
                except Exception as error:
                    if attempt == 3:
                        raise
                    log(f"Conexao caiu em {file_name}; reconectando e tentando de novo ({attempt}/3).")
                    reconnect()
        if touched:
            chunk_size = 50
            for offset in range(0, len(touched), chunk_size):
                chunk = " ".join(shlex.quote(path) for path in touched[offset : offset + chunk_size])
                ssh_exec(
                    client,
                    f"chown {DEFAULT_CONTAINER_USER} {chunk}; chmod 0644 {chunk}",
                    timeout=60,
                )
        log(f"Upload concluido: {uploaded} enviado(s), {skipped} ja existiam.")
        return remote_env_value(client, "API_SECURITY_KEY", DEFAULT_API_KEY)
    finally:
        try:
            if sftp is not None:
                sftp.close()
        except Exception:
            pass
        client.close()


class ApiError(RuntimeError):
    def __init__(self, status: int, body: str):
        super().__init__(f"HTTP {status}: {body}")
        self.status = status
        self.body = body


def request_json(
    api_base: str,
    path: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    api_key: str = "",
    token: str = "",
    admin_token: str = "",
    timeout: int = 60,
) -> Any:
    body = None
    headers = {"Accept": "application/json, text/plain"}
    if api_key:
        headers["X-API-KEY"] = api_key
    if token:
        headers["Authorization"] = "Bearer " + token
    if admin_token:
        headers["X-ADMIN-TOKEN"] = admin_token
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"
    request = urllib.request.Request(
        api_base.rstrip("/") + path,
        data=body,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            response_body = response.read().decode("utf-8", errors="replace")
            if response_body.strip().startswith(("{", "[")):
                return json.loads(response_body)
            return response_body
    except urllib.error.HTTPError as error:
        body_text = error.read().decode("utf-8", errors="replace")
        raise ApiError(error.code, body_text) from error


def ensure_user_token(config: ImportConfig, api_key: str, log) -> str:
    payload = {"username": config.app_username, "password": config.app_password}
    try:
        response = request_json(config.api_base, "/auth/login", method="POST", payload=payload, api_key=api_key)
        log(f"Usuario existente autenticado: {config.app_username}")
        return str(response["token"])
    except ApiError as login_error:
        log(f"Login nao entrou, tentando criar usuario: {config.app_username}")
        try:
            response = request_json(config.api_base, "/auth/register", method="POST", payload=payload, api_key=api_key)
            log(f"Usuario criado: {config.app_username}")
            return str(response["token"])
        except ApiError as register_error:
            raise ImportErrorWithDetails(
                "Nao consegui entrar nem criar o usuario. "
                f"Login: {login_error.body}; Registro: {register_error.body}"
            ) from register_error


def stream_url(api_base: str, entry: dict[str, Any]) -> str:
    query = urllib.parse.urlencode(
        {
            "titulo": entry.get("title") or "musica",
            "artista": entry.get("artist") or "",
        }
    )
    return f"{api_base.rstrip('/')}/musicas/baixar/{urllib.parse.quote(entry['sourceId'])}?{query}"


def save_to_user_library(
    config: ImportConfig,
    entries: list[dict[str, Any]],
    api_key: str,
    token: str,
    log,
) -> list[int]:
    for index, entry in enumerate(entries, start=1):
        payload = {
            "title": entry.get("title") or entry["sourceId"],
            "artist": entry.get("artist") or "",
            "uri": stream_url(config.api_base, entry),
            "coverUrl": entry.get("coverUrl") or "",
            "sourceId": entry["sourceId"],
        }
        request_json(config.api_base, "/songs/save", method="POST", payload=payload, api_key=api_key, token=token)
        log(f"[{index}/{len(entries)}] biblioteca: {payload['title']}")

    library = request_json(config.api_base, "/songs/my-library", api_key=api_key, token=token, timeout=90)
    source_to_id = {
        str(song.get("sourceId")): int(song["id"])
        for song in library
        if isinstance(song, dict) and song.get("sourceId") and song.get("id")
    }
    missing = [entry["sourceId"] for entry in entries if entry["sourceId"] not in source_to_id]
    if missing:
        raise ImportErrorWithDetails("Musicas nao apareceram na biblioteca: " + ", ".join(missing[:20]))
    return [source_to_id[entry["sourceId"]] for entry in entries]


def import_songs_to_catalog(
    config: ImportConfig,
    entries: list[dict[str, Any]],
    api_key: str,
    admin_token: str,
    log,
) -> list[int]:
    song_ids: list[int] = []
    for index, entry in enumerate(entries, start=1):
        payload = {
            "title": entry.get("title") or entry["sourceId"],
            "artist": entry.get("artist") or "",
            "uri": stream_url(config.api_base, entry),
            "coverUrl": entry.get("coverUrl") or "",
            "sourceId": entry["sourceId"],
        }
        song = request_json(
            config.api_base,
            "/admin/songs/import",
            method="POST",
            payload=payload,
            api_key=api_key,
            admin_token=admin_token,
            timeout=60,
        )
        if not isinstance(song, dict) or not song.get("id"):
            raise ImportErrorWithDetails(f"Importacao admin nao retornou ID para: {payload['title']}")
        song_ids.append(int(song["id"]))
        log(f"[{index}/{len(entries)}] catalogo global: {payload['title']}")
    return song_ids


def upsert_personal_playlist(
    config: ImportConfig,
    playlist: dict[str, Any],
    song_ids: list[int],
    api_key: str,
    token: str,
    log,
) -> int | None:
    if not config.create_personal_playlist:
        return None
    name = playlist.get("name") or "Playlist do Spotify"
    payload = {
        "name": name,
        "description": f"Musicas selecionadas da playlist {name}.",
        "iconUrl": playlist.get("coverUrl") or None,
        "globalPlaylist": False,
    }
    playlists = request_json(config.api_base, "/playlists/personal", api_key=api_key, token=token, timeout=60)
    existing = next(
        (item for item in playlists if isinstance(item, dict) and item.get("name") == name),
        None,
    )
    if existing:
        saved = request_json(
            config.api_base,
            f"/playlists/personal/{int(existing['id'])}",
            method="PUT",
            payload=payload,
            api_key=api_key,
            token=token,
        )
        log(f"Playlist pessoal atualizada: {name}")
    else:
        saved = request_json(
            config.api_base,
            "/playlists/personal",
            method="POST",
            payload=payload,
            api_key=api_key,
            token=token,
        )
        log(f"Playlist pessoal criada: {name}")
    playlist_id = int(saved["id"])
    request_json(
        config.api_base,
        f"/playlists/personal/{playlist_id}/songs",
        method="POST",
        payload={"songIds": song_ids},
        api_key=api_key,
        token=token,
        timeout=90,
    )
    log(f"Playlist pessoal recebeu {len(song_ids)} musica(s).")
    return playlist_id


def login_admin_from_remote(config: ImportConfig, api_key: str) -> str:
    client = connect_ssh(config)
    try:
        admin_username = remote_env_value(client, "ADMIN_USERNAME")
        admin_password = remote_env_value(client, "ADMIN_PASSWORD")
    finally:
        client.close()
    if not admin_username or not admin_password:
        raise ImportErrorWithDetails("ADMIN_USERNAME/ADMIN_PASSWORD nao encontrados na VPS.")
    response = request_json(
        config.api_base,
        "/admin/auth/login",
        method="POST",
        payload={"username": admin_username, "password": admin_password},
        api_key=api_key,
    )
    token = response.get("adminToken") or response.get("token")
    if not token:
        raise ImportErrorWithDetails("Login admin nao retornou token.")
    return str(token)


def upsert_global_playlist(
    config: ImportConfig,
    playlist: dict[str, Any],
    entries: list[dict[str, Any]],
    song_ids: list[int],
    api_key: str,
    admin_token: str,
    log,
) -> int | None:
    if not config.create_global_playlist:
        return None
    name = playlist.get("name") or "Playlist do Spotify"
    payload = {
        "name": name,
        "description": f"Musicas selecionadas da playlist {name}.",
        "iconUrl": playlist.get("coverUrl") or None,
        "globalPlaylist": True,
    }
    playlists = request_json(config.api_base, "/admin/playlists", api_key=api_key, admin_token=admin_token)
    existing = next(
        (
            item
            for item in playlists
            if isinstance(item, dict)
            and item.get("globalPlaylist") is not False
            and item.get("name") == name
        ),
        None,
    )
    if existing:
        saved = request_json(
            config.api_base,
            f"/admin/playlists/{int(existing['id'])}",
            method="PUT",
            payload=payload,
            api_key=api_key,
            admin_token=admin_token,
        )
        log(f"Playlist global atualizada: {name}")
    else:
        saved = request_json(
            config.api_base,
            "/admin/playlists",
            method="POST",
            payload=payload,
            api_key=api_key,
            admin_token=admin_token,
        )
        log(f"Playlist global criada: {name}")
    playlist_id = int(saved["id"])
    request_json(
        config.api_base,
        f"/admin/playlists/{playlist_id}/songs",
        method="POST",
        payload={"songIds": song_ids},
        api_key=api_key,
        admin_token=admin_token,
    )
    log(f"Playlist global recebeu {len(entries)} musica(s).")
    return playlist_id


def run_import(
    config: ImportConfig,
    log=print,
    playlist_override: dict[str, Any] | None = None,
) -> dict[str, Any]:
    playlist = playlist_override or run_json_script(
        DEPLOY_DIR / "spotify_playlist.py", [config.spotify_url, str(config.limit)], log
    )
    log(f"Spotify: {playlist.get('name')} ({len(playlist.get('tracks', []))} faixa(s))")
    with PotTunnel(config, log) as tunnel:
        pot_url = f"http://127.0.0.1:{tunnel.local_port}"
        output_dir, entries = precache_playlist(config, playlist, pot_url, log)
    api_key = upload_entries(config, output_dir, entries, log)
    user_song_ids: list[int] = []
    personal_playlist_id = None
    if config.create_personal_playlist:
        token = ensure_user_token(config, api_key, log)
        user_song_ids = save_to_user_library(config, entries, api_key, token, log)
        personal_playlist_id = upsert_personal_playlist(config, playlist, user_song_ids, api_key, token, log)

    global_playlist_id = None
    global_song_ids: list[int] = []
    catalog_import_required = config.create_global_playlist or not config.create_personal_playlist
    if catalog_import_required:
        admin_token = login_admin_from_remote(config, api_key)
        global_song_ids = import_songs_to_catalog(config, entries, api_key, admin_token, log)
        if config.create_global_playlist:
            global_playlist_id = upsert_global_playlist(config, playlist, entries, global_song_ids, api_key, admin_token, log)
        else:
            log(f"Catalogo de pesquisa recebeu {len(global_song_ids)} musica(s), sem criar playlist.")

    result = {
        "spotifyId": playlist.get("spotifyId"),
        "playlistName": playlist.get("name"),
        "mode": "catalog-only" if not config.create_personal_playlist and not config.create_global_playlist else "playlist",
        "downloaded": len(entries),
        "spotifyTrackIds": [entry.get("spotifyId") for entry in entries if entry.get("spotifyId")],
        "songIds": user_song_ids or global_song_ids,
        "userSongIds": user_song_ids,
        "catalogSongIds": global_song_ids,
        "globalSongIds": global_song_ids,
        "personalPlaylistId": personal_playlist_id,
        "globalPlaylistId": global_playlist_id,
        "cacheDir": str(output_dir),
        "apiBase": config.api_base,
        "username": config.app_username if config.create_personal_playlist else None,
    }
    log("Importacao concluida.")
    return result


HTML = r"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NationMusics VPS Importer</title>
  <style>
    :root { color-scheme: dark; --bg: #090c0f; --panel: #12171d; --line: #26303a; --text: #eef4f0; --muted: #8fa09a; --green: #1ed760; --red: #ff6b6b; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: var(--bg); color: var(--text); }
    main { max-width: 1080px; margin: 0 auto; padding: 24px; display: grid; grid-template-columns: 380px 1fr; gap: 18px; }
    h1 { font-size: 24px; margin: 0 0 16px; }
    h2 { font-size: 16px; margin: 20px 0 10px; color: var(--muted); }
    label { display: block; font-size: 13px; color: var(--muted); margin: 12px 0 6px; }
    input, button { width: 100%; border: 1px solid var(--line); border-radius: 6px; padding: 11px 12px; background: #0d1116; color: var(--text); font-size: 14px; }
    input[type="checkbox"] { width: auto; margin-right: 8px; }
    button { background: var(--green); color: #041108; border: 0; font-weight: 700; cursor: pointer; margin-top: 16px; }
    button:disabled { opacity: .55; cursor: wait; }
    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 18px; }
    .row { display: grid; grid-template-columns: 1fr 92px; gap: 10px; }
    .auto-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .check { display: flex; align-items: center; color: var(--text); margin-top: 12px; }
    .status { font-weight: 700; margin-bottom: 12px; }
    .status.done { color: var(--green); }
    .status.error { color: var(--red); }
    pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.45; min-height: 520px; max-height: calc(100vh - 120px); overflow: auto; }
    .hint { color: var(--muted); font-size: 13px; line-height: 1.45; }
    .danger { background: #55252a; color: #fff; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    details { margin-top: 22px; border-top: 1px solid var(--line); padding-top: 14px; }
    summary { cursor: pointer; color: var(--muted); font-weight: 700; }
    .source { padding: 7px 9px; margin: 6px 0; border-radius: 5px; background: #0d1116; font-size: 13px; }
    @media (max-width: 900px) { main { grid-template-columns: 1fr; padding: 14px; } }
  </style>
</head>
<body>
  <main>
    <section class="panel">
      <h1>Importador automático</h1>
      <p class="hint">Sem copiar links. Usa listas famosas e lançamentos, baixa em lotes pequenos e lembra o que já foi concluído.</p>
      <form id="autoForm">
        <label>Senha SSH da VPS (opcional quando usar chave)</label>
        <input name="sshPassword" type="password" placeholder="senha da VPS" />
        <label>Caminho da chave SSH (recomendado para 24/7)</label>
        <input name="sshKeyPath" value="~/.ssh/nationmusics_vps_ed25519" />
        <div class="auto-grid">
          <div><label>Por lote/fonte</label><input name="maxPerSource" type="number" min="1" max="10" value="3" /></div>
          <div><label>Intervalo entre ciclos (min)</label><input name="cycleMinutes" type="number" min="2" max="120" value="10" /></div>
        </div>
        <div class="auto-grid">
          <div><label>Pausa (segundos)</label><input name="sleepSeconds" type="number" min="2" max="120" value="8" /></div>
          <div><label>Modo</label><input value="Contínuo 24/7, sem limite total" disabled /></div>
        </div>
        <h2>Fontes automáticas</h2>
        <div class="source">🇧🇷 Hits Brasil — mistura dos maiores sucessos</div>
        <div class="source">🔥 Funk brasileiro — hits e lançamentos</div>
        <div class="source">🤠 Sertanejo — mais tocadas e novidades</div>
        <div class="source">🥁 Pagode e samba — destaques atuais</div>
        <div class="source">💎 Trap nacional — artistas e lançamentos</div>
        <div class="source">🪗 Forró e piseiro — sucessos brasileiros</div>
        <div class="actions">
          <button id="autoStart" type="submit">Iniciar automático</button>
          <button id="autoStop" class="danger" type="button" disabled>Parar</button>
        </div>
      </form>

      <details>
        <summary>Importar um link manualmente</summary>
      <form id="manualForm">
        <h2>VPS</h2>
        <label>SSH host</label>
        <div class="row">
          <input name="sshHost" value="38.18.230.83" />
          <input name="sshPort" value="22" />
        </div>
        <label>SSH usuario</label>
        <input name="sshUser" value="root" />
        <label>SSH senha</label>
        <input name="sshPassword" type="password" placeholder="senha da VPS" />
        <label>Chave SSH (opcional)</label>
        <input name="sshKeyPath" value="~/.ssh/nationmusics_vps_ed25519" />
        <label>API base</label>
        <input name="apiBase" value="https://marlonbarbershop.com/nationmusics/api" />

        <h2>Usuario do app</h2>
        <p class="hint">Necessario apenas quando a playlist pessoal estiver marcada.</p>
        <label>Usuario</label>
        <input name="appUsername" placeholder="ex: guilherme" />
        <label>Senha</label>
        <input name="appPassword" type="password" placeholder="senha do usuario" />

        <h2>Spotify</h2>
        <label>Link da playlist, album ou musica</label>
        <input name="spotifyUrl" placeholder="https://open.spotify.com/playlist/..." />
        <label>Intervalo entre musicas, em segundos</label>
        <input name="sleepSeconds" value="2" />
        <label class="check"><input type="checkbox" name="createPersonalPlaylist" checked /> Criar/atualizar playlist pessoal do usuario</label>
        <label class="check"><input type="checkbox" name="createGlobalPlaylist" /> Criar/atualizar playlist global na aba principal</label>
        <p class="hint">Para uma musica ou album aparecer apenas na pesquisa, deixe as duas opcoes de playlist desmarcadas.</p>
        <button id="submit" type="submit">Importar para VPS</button>
      </form>
      </details>
    </section>
    <section class="panel">
      <div id="status" class="status">Pronto</div>
      <pre id="logs"></pre>
    </section>
  </main>
  <script>
    const form = document.getElementById('manualForm');
    const autoForm = document.getElementById('autoForm');
    const autoStart = document.getElementById('autoStart');
    const autoStop = document.getElementById('autoStop');
    const submit = document.getElementById('submit');
    const logs = document.getElementById('logs');
    const statusEl = document.getElementById('status');
    let timer = null;
    let autoTimer = null;

    function syncUserFields() {
      const enabled = form.createPersonalPlaylist.checked;
      form.appUsername.disabled = !enabled;
      form.appPassword.disabled = !enabled;
      form.appUsername.placeholder = enabled ? 'ex: guilherme' : 'nao precisa para catalogo/global';
      form.appPassword.placeholder = enabled ? 'senha do usuario' : 'nao precisa para catalogo/global';
    }

    function formData() {
      const data = Object.fromEntries(new FormData(form).entries());
      data.createPersonalPlaylist = form.createPersonalPlaylist.checked;
      data.createGlobalPlaylist = form.createGlobalPlaylist.checked;
      return data;
    }

    async function poll(id) {
      const response = await fetch('/api/jobs/' + id);
      const job = await response.json();
      statusEl.textContent = job.status === 'running' ? 'Rodando' : job.status === 'done' ? 'Concluido' : 'Erro';
      statusEl.className = 'status ' + job.status;
      logs.textContent = (job.logs || []).join('\n');
      if (job.error) logs.textContent += '\n\nERRO: ' + job.error;
      if (job.result) logs.textContent += '\n\nRESULTADO:\n' + JSON.stringify(job.result, null, 2);
      logs.scrollTop = logs.scrollHeight;
      if (job.status !== 'running') {
        clearInterval(timer);
        submit.disabled = false;
      }
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = true;
      logs.textContent = '';
      statusEl.textContent = 'Iniciando';
      statusEl.className = 'status';
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData())
      });
      const body = await response.json();
      if (!response.ok) {
        statusEl.textContent = 'Erro';
        statusEl.className = 'status error';
        logs.textContent = body.error || 'Falha ao iniciar';
        submit.disabled = false;
        return;
      }
      timer = setInterval(() => poll(body.id), 1500);
      poll(body.id);
    });
    form.createPersonalPlaylist.addEventListener('change', syncUserFields);

    async function pollAutomation() {
      const response = await fetch('/api/automation');
      const job = await response.json();
      const active = job.status === 'running' || job.status === 'stopping';
      autoStart.disabled = active;
      autoStop.disabled = !active;
      if (job.status && job.status !== 'idle') {
        statusEl.textContent = job.status === 'running' ? 'Automático rodando' : job.status === 'stopping' ? 'Parando com segurança' : job.status === 'done' ? 'Automático concluído' : job.status === 'stopped' ? 'Automático parado' : 'Erro';
        statusEl.className = 'status ' + (job.status === 'error' ? 'error' : job.status === 'done' ? 'done' : '');
        logs.textContent = (job.logs || []).join('\n');
        if (job.error) logs.textContent += '\n\nERRO: ' + job.error;
        logs.scrollTop = logs.scrollHeight;
      }
      if (!active && autoTimer) {
        clearInterval(autoTimer);
        autoTimer = null;
      }
    }

    autoForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(autoForm).entries());
      autoStart.disabled = true;
      logs.textContent = '';
      statusEl.textContent = 'Iniciando automático';
      const response = await fetch('/api/automation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const body = await response.json();
      if (!response.ok) {
        statusEl.textContent = 'Erro';
        statusEl.className = 'status error';
        logs.textContent = body.error || 'Falha ao iniciar';
        autoStart.disabled = false;
        return;
      }
      autoForm.sshPassword.value = '';
      autoTimer = setInterval(pollAutomation, 1500);
      pollAutomation();
    });

    autoStop.addEventListener('click', async () => {
      autoStop.disabled = true;
      await fetch('/api/automation/stop', { method: 'POST' });
      pollAutomation();
    });

    syncUserFields();
    pollAutomation();
  </script>
</body>
</html>
"""


def automatic_config(data: dict[str, Any]) -> tuple[dict[str, Any], str]:
    config_path = Path(__file__).with_name("automation.json")
    if not config_path.is_file():
        config_path = Path(__file__).with_name("automation.example.json")
    config = automation.load_json(config_path)
    ssh_password = str(data.get("sshPassword") or "")
    ssh_key_path = str(data.get("sshKeyPath") or config.get("sshKeyPath") or "").strip()
    if not ssh_password and not (ssh_key_path and Path(ssh_key_path).expanduser().is_file()):
        raise ValueError("Informe a senha SSH ou uma chave privada existente.")
    max_per_source = min(10, max(1, int(data.get("maxPerSource") or 3)))
    cycle_minutes = min(120, max(2, int(data.get("cycleMinutes") or 10)))
    sleep_seconds = min(120, max(2, float(data.get("sleepSeconds") or 8)))
    config.update(
        {
            "continuous": True,
            "maxTracksPerRun": 1000000,
            "maxTracksPerSource": max_per_source,
            "maxRuntimeMinutes": 1440,
            "cycleDelayMinutes": cycle_minutes,
            "sleepSeconds": sleep_seconds,
            "sshKeyPath": ssh_key_path,
        }
    )
    automation.enabled_sources(config)
    return config, ssh_password


def run_automation_job(job: AutomationJob) -> None:
    try:
        with automation.single_instance(automation.LOCK_PATH):
            job.log("Automacao iniciada. Nao e necessario fornecer links.")
            cycle = 0
            while not job.stop_event.is_set():
                cycle += 1
                job.log(f"Ciclo {cycle}: procurando musicas brasileiras novas.")
                automation.run(
                    Path(__file__).with_name("automation.example.json"),
                    automation.DEFAULT_STATE,
                    config_override=job.config,
                    ssh_password=job.ssh_password,
                    should_stop=job.stop_event.is_set,
                    logger=job.log,
                )
                if job.stop_event.is_set():
                    break
                delay_minutes = max(2, int(job.config.get("cycleDelayMinutes", 10)))
                job.log(f"Ciclo concluido. Nova verificacao em {delay_minutes} minuto(s).")
                job.stop_event.wait(delay_minutes * 60)
        with job.lock:
            job.status = "stopped" if job.stop_event.is_set() else "done"
            job.finished_at = time.time()
    except Exception as error:
        job.log("ERRO: " + str(error))
        with job.lock:
            job.status = "error"
            job.error = str(error)
            job.finished_at = time.time()
    finally:
        # A senha existe somente na memoria durante esta execucao.
        job.ssh_password = ""


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, content_type: str, body: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send(status, "application/json; charset=utf-8", body)

    def do_GET(self) -> None:
        if self.path == "/" or self.path.startswith("/?"):
            self._send(200, "text/html; charset=utf-8", HTML.encode("utf-8"))
            return
        if self.path.startswith("/api/jobs/"):
            job_id = self.path.rsplit("/", 1)[-1]
            with JOBS_LOCK:
                job = JOBS.get(job_id)
            if not job:
                self._json(404, {"error": "Job nao encontrado."})
                return
            self._json(200, job.snapshot())
            return
        if self.path == "/api/automation":
            with AUTO_JOB_LOCK:
                auto_job = AUTO_JOB
            if auto_job is None:
                self._json(200, {"status": "idle", "logs": []})
            else:
                self._json(200, auto_job.snapshot())
            return
        self._json(404, {"error": "Nao encontrado."})

    def do_POST(self) -> None:
        global AUTO_JOB
        if self.path == "/api/automation/stop":
            with AUTO_JOB_LOCK:
                auto_job = AUTO_JOB
            if auto_job is None or auto_job.status not in {"running", "stopping"}:
                self._json(409, {"error": "A automacao nao esta rodando."})
                return
            auto_job.request_stop()
            self._json(200, {"status": "stopping"})
            return
        if self.path not in {"/api/jobs", "/api/automation/start"}:
            self._json(404, {"error": "Nao encontrado."})
            return
        try:
            length = int(self.headers.get("Content-Length") or "0")
            data = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except Exception as error:
            self._json(400, {"error": str(error)})
            return
        if self.path == "/api/automation/start":
            try:
                auto_config, ssh_password = automatic_config(data)
            except Exception as error:
                self._json(400, {"error": str(error)})
                return
            with AUTO_JOB_LOCK:
                if AUTO_JOB is not None and AUTO_JOB.status in {"running", "stopping"}:
                    self._json(409, {"error": "A automacao ja esta rodando."})
                    return
                AUTO_JOB = AutomationJob(auto_config, ssh_password)
                auto_job = AUTO_JOB
            thread = threading.Thread(target=run_automation_job, args=(auto_job,), daemon=True)
            thread.start()
            self._json(200, {"status": "running"})
            return
        try:
            config = parse_config(data)
        except Exception as error:
            self._json(400, {"error": str(error)})
            return
        job = Job(config)
        with JOBS_LOCK:
            JOBS[job.id] = job
        thread = threading.Thread(target=run_job, args=(job,), daemon=True)
        thread.start()
        self._json(200, {"id": job.id})

    def log_message(self, fmt: str, *args) -> None:
        return


def run_job(job: Job) -> None:
    try:
        result = run_import(job.config, job.log)
        job.finish(result)
    except Exception as error:
        job.log("ERRO: " + str(error))
        job.fail(error)


def serve(host: str, port: int) -> None:
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Interface local: http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--ssh-host", default="38.18.229.2")
    parser.add_argument("--ssh-port", type=int, default=22)
    parser.add_argument("--ssh-user", default="root")
    parser.add_argument("--ssh-password", default=os.environ.get("NATIONMUSICS_SSH_PASSWORD", ""))
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--app-username", default="")
    parser.add_argument("--app-password", default=os.environ.get("NATIONMUSICS_APP_PASSWORD", ""))
    parser.add_argument("--spotify-url", default="")
    parser.add_argument("--no-personal-playlist", action="store_true")
    parser.add_argument("--create-global-playlist", action="store_true")
    args = parser.parse_args()
    if args.once:
        config = parse_config(
            {
                "sshHost": args.ssh_host,
                "sshPort": args.ssh_port,
                "sshUser": args.ssh_user,
                "sshPassword": args.ssh_password,
                "apiBase": args.api_base,
                "appUsername": args.app_username,
                "appPassword": args.app_password,
                "spotifyUrl": args.spotify_url,
                "createPersonalPlaylist": not args.no_personal_playlist,
                "createGlobalPlaylist": args.create_global_playlist,
            }
        )
        result = run_import(config, lambda message: print(message, flush=True))
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    serve(args.host, args.port)


if __name__ == "__main__":
    main()
