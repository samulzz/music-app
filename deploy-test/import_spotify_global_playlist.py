import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


def run_spotify_helper(helper_path, playlist_url):
    result = subprocess.run(
        [sys.executable, str(helper_path), playlist_url, "200"],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
    )
    return json.loads(result.stdout)


def request_json(base_url, method, path, payload=None, admin_token=None):
    data = None
    headers = {"Accept": "application/json"}
    api_key = os.environ.get("API_SECURITY_KEY", "").strip()
    if api_key:
        headers["X-API-KEY"] = api_key
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"
    if admin_token:
        headers["X-ADMIN-TOKEN"] = admin_token

    request = urllib.request.Request(
        base_url.rstrip("/") + path,
        data=data,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else None
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} falhou ({error.code}): {body}") from error


def login_admin(base_url):
    username = os.environ.get("ADMIN_USERNAME", "").strip()
    password = os.environ.get("ADMIN_PASSWORD", "")
    if not username or not password:
        raise RuntimeError("ADMIN_USERNAME/ADMIN_PASSWORD não estão disponíveis no ambiente.")

    response = request_json(
        base_url,
        "POST",
        "/admin/auth/login",
        {"username": username, "password": password},
    )
    token = (response.get("adminToken") or response.get("token")) if isinstance(response, dict) else None
    if not token:
        raise RuntimeError("Login admin não retornou token.")
    return token


def playlist_marker(spotify_id):
    return f"spotify:{spotify_id}"


def find_existing_playlist(playlists, spotify_id, name):
    marker = playlist_marker(spotify_id)
    for playlist in playlists:
        description = str(playlist.get("description") or "")
        if marker in description:
            return playlist
    for playlist in playlists:
        if playlist.get("globalPlaylist") is not False and playlist.get("name") == name:
            return playlist
    return None


def main():
    if len(sys.argv) < 4:
        raise ValueError(
            "Uso: import_spotify_global_playlist.py PLAYLIST_URL MANIFEST_PATH API_BASE"
        )

    playlist_url = sys.argv[1]
    manifest_path = Path(sys.argv[2]).resolve()
    api_base = sys.argv[3].rstrip("/")
    helper_path = Path(__file__).with_name("spotify_playlist.py")

    playlist = run_spotify_helper(helper_path, playlist_url)
    entries = json.loads(manifest_path.read_text(encoding="utf-8"))
    playlist_spotify_ids = {track.get("spotifyId") for track in playlist.get("tracks", [])}
    entries = [
        entry for entry in entries
        if entry.get("sourceId") and entry.get("spotifyId") in playlist_spotify_ids
    ]
    if not entries:
        raise RuntimeError("Manifest não contém músicas baixadas.")

    token = login_admin(api_base)
    song_ids = []
    for index, entry in enumerate(entries, start=1):
        song = request_json(
            api_base,
            "POST",
            "/admin/songs/import",
            {
                "title": entry.get("title"),
                "artist": entry.get("artist"),
                "uri": entry.get("fileName") or f"{entry.get('sourceId')}.mp3",
                "coverUrl": entry.get("coverUrl"),
                "sourceId": entry.get("sourceId"),
            },
            token,
        )
        song_id = song.get("id") if isinstance(song, dict) else None
        if song_id:
            song_ids.append(int(song_id))
        print(f"[{index}/{len(entries)}] importada: {entry.get('title')} -> {song_id}", flush=True)

    description = f"Musicas selecionadas da playlist {playlist['name']}."
    payload = {
        "name": playlist["name"],
        "description": description,
        "iconUrl": playlist.get("coverUrl") or None,
        "globalPlaylist": True,
    }

    playlists = request_json(api_base, "GET", "/admin/playlists", admin_token=token)
    existing = find_existing_playlist(playlists if isinstance(playlists, list) else [], playlist["spotifyId"], playlist["name"])
    if existing:
        saved_playlist = request_json(api_base, "PUT", f"/admin/playlists/{existing['id']}", payload, token)
    else:
        saved_playlist = request_json(api_base, "POST", "/admin/playlists", payload, token)

    playlist_id = saved_playlist["id"]
    if song_ids:
        request_json(api_base, "POST", f"/admin/playlists/{playlist_id}/songs", {"songIds": song_ids}, token)

    print(json.dumps({
        "playlistId": playlist_id,
        "name": saved_playlist.get("name"),
        "songCount": len(song_ids),
    }, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Erro fatal: {error}", file=sys.stderr)
        sys.exit(1)
