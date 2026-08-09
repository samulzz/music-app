import base64
import hashlib
import hmac
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path


def base64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def make_jwt(username):
    secret = os.environ.get("JWT_SECRET", "")
    if not secret:
        raise RuntimeError("JWT_SECRET não está disponível no ambiente.")
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {"sub": username, "iat": now, "exp": now + 24 * 60 * 60}
    signing_input = (
        base64url(json.dumps(header, separators=(",", ":")).encode("utf-8"))
        + "."
        + base64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    )
    signature = hmac.new(secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return signing_input + "." + base64url(signature)


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


def api_headers(admin_token=None, jwt_token=None, json_body=False):
    api_key = os.environ.get("API_SECURITY_KEY", "").strip()
    headers = {"Accept": "application/json"}
    if api_key:
        headers["X-API-KEY"] = api_key
    if admin_token:
        headers["X-ADMIN-TOKEN"] = admin_token
    if jwt_token:
        headers["Authorization"] = "Bearer " + jwt_token
    if json_body:
        headers["Content-Type"] = "application/json; charset=utf-8"
    return headers


def request_json(base_url, method, path, payload=None, admin_token=None, jwt_token=None, timeout=90):
    data = None
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        base_url.rstrip("/") + path,
        data=data,
        headers=api_headers(admin_token=admin_token, jwt_token=jwt_token, json_body=payload is not None),
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
            return json.loads(body) if body.strip() else None
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} falhou ({error.code}): {body}") from error


def request_download(base_url, source_id, title, artist, jwt_token):
    query = urllib.parse.urlencode({"titulo": title or "musica", "artista": artist or ""})
    request = urllib.request.Request(
        f"{base_url.rstrip()}/musicas/baixar/{urllib.parse.quote(source_id)}?{query}",
        headers=api_headers(jwt_token=jwt_token),
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=240) as response:
            while response.read(1024 * 1024):
                pass
            return True
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        print(f"  download falhou ({source_id}): {error.code} {body[:300]}", flush=True)
        return False
    except Exception as error:
        print(f"  download falhou ({source_id}): {error}", flush=True)
        return False


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


def normalize(value):
    decomposed = unicodedata.normalize("NFKD", value or "")
    ascii_value = decomposed.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", ascii_value.lower()).strip()


def token_coverage(expected_tokens, actual_tokens):
    if not expected_tokens:
        return 0
    matched = 0
    for expected in expected_tokens:
        similarity = max(
            (SequenceMatcher(None, expected, actual).ratio() for actual in actual_tokens),
            default=0,
        )
        if similarity >= 0.75:
            matched += 1
    return matched / len(expected_tokens)


def score_candidate(track, candidate):
    target_title = normalize(track.get("title", ""))
    candidate_title = normalize(candidate.get("titulo", ""))
    title_tokens = {token for token in target_title.split() if len(token) > 1}
    candidate_tokens = set(candidate_title.split())
    title_score = token_coverage(title_tokens, candidate_tokens)
    if title_score < 0.45:
        return -1

    artist = normalize(str(track.get("artist", "")).split(", ")[0])
    artist_tokens = {token for token in artist.split() if len(token) > 1}
    candidate_artist_text = normalize(candidate.get("titulo", "") + " " + candidate.get("artista", ""))
    artist_score = token_coverage(artist_tokens, set(candidate_artist_text.split()))

    score = title_score * 100 + artist_score * 35
    if target_title and target_title in candidate_title:
        score += 50
    source_id = str(candidate.get("id", ""))
    if source_id.startswith("audius-"):
        score += 8
    if source_id.startswith("deezer-"):
        score += 5
    return score


def rank_candidates(track, candidates):
    scored = []
    for candidate in candidates:
        source_id = str(candidate.get("id") or "")
        if not source_id or source_id.startswith(("deezer-", "audius-")):
            continue
        score = score_candidate(track, candidate)
        if score >= 0:
            scored.append((score, candidate))
    return [candidate for _, candidate in sorted(scored, key=lambda item: item[0], reverse=True)]


def pick_candidate(track, candidates):
    ranked = rank_candidates(track, candidates)
    return ranked[0] if ranked else None


def playlist_marker(spotify_id):
    return f"spotify:{spotify_id}"


def find_existing_playlist(playlists, spotify_id, name):
    marker = playlist_marker(spotify_id)
    for playlist in playlists:
        if marker in str(playlist.get("description") or ""):
            return playlist
    for playlist in playlists:
        if playlist.get("globalPlaylist") is not False and playlist.get("name") == name:
            return playlist
    return None


def main():
    if len(sys.argv) < 2:
        raise ValueError("Uso: hydrate_spotify_playlist_via_api.py PLAYLIST_URL [USERNAME] [API_BASE]")

    playlist_url = sys.argv[1]
    username = sys.argv[2] if len(sys.argv) >= 3 else os.environ.get("PRECACHE_USERNAME", "samulsz")
    api_base = sys.argv[3] if len(sys.argv) >= 4 else "http://127.0.0.1:8080/api"
    helper_path = Path(__file__).with_name("spotify_playlist.py")

    playlist = run_spotify_helper(helper_path, playlist_url)
    admin_token = login_admin(api_base)
    jwt_token = make_jwt(username)

    entries = []
    song_ids = []
    total = len(playlist.get("tracks", []))
    for index, track in enumerate(playlist.get("tracks", []), start=1):
        query = f"{track.get('title', '')} {track.get('artist', '')}".strip()
        print(f"[{index}/{total}] buscando: {query}", flush=True)
        try:
            candidates = request_json(
                api_base,
                "GET",
                "/admin/songs/search-external?" + urllib.parse.urlencode({"q": query}),
                admin_token=admin_token,
                timeout=140,
            )
            ranked_candidates = rank_candidates(track, candidates if isinstance(candidates, list) else [])
            if not ranked_candidates:
                print("  sem candidato", flush=True)
                continue

            candidate = None
            source_id = ""
            downloaded = False
            for attempt, possible_candidate in enumerate(ranked_candidates[:5], start=1):
                possible_source_id = str(possible_candidate.get("id"))
                print(f"  candidato {attempt}: {possible_source_id}", flush=True)
                if request_download(api_base, possible_source_id, track.get("title", ""), track.get("artist", ""), jwt_token):
                    candidate = possible_candidate
                    source_id = possible_source_id
                    downloaded = True
                    break

            if not downloaded or candidate is None:
                print("  sem candidato baixavel", flush=True)
                continue

            song = request_json(
                api_base,
                "POST",
                "/admin/songs/import",
                {
                    "title": track.get("title") or candidate.get("titulo"),
                    "artist": track.get("artist") or candidate.get("artista"),
                    "uri": source_id + ".mp3",
                    "coverUrl": candidate.get("capa") or playlist.get("coverUrl"),
                    "sourceId": source_id,
                },
                admin_token=admin_token,
            )
            song_id = song.get("id") if isinstance(song, dict) else None
            if song_id:
                song_ids.append(int(song_id))
            entries.append({
                "spotifyId": track.get("spotifyId"),
                "sourceId": source_id,
                "title": track.get("title") or candidate.get("titulo"),
                "artist": track.get("artist") or candidate.get("artista"),
                "coverUrl": candidate.get("capa") or playlist.get("coverUrl"),
                "downloaded": downloaded,
                "songId": song_id,
            })
            print(f"  OK: {source_id} songId={song_id} downloaded={downloaded}", flush=True)
        except Exception as error:
            print(f"  ERRO: {error}", flush=True)

        if index < total:
            time.sleep(1)

    description = f"Musicas selecionadas da playlist {playlist['name']}."
    payload = {
        "name": playlist["name"],
        "description": description,
        "iconUrl": playlist.get("coverUrl") or None,
        "globalPlaylist": True,
    }
    playlists = request_json(api_base, "GET", "/admin/playlists", admin_token=admin_token)
    existing = find_existing_playlist(playlists if isinstance(playlists, list) else [], playlist["spotifyId"], playlist["name"])
    if existing:
        saved_playlist = request_json(api_base, "PUT", f"/admin/playlists/{existing['id']}", payload, admin_token=admin_token)
    else:
        saved_playlist = request_json(api_base, "POST", "/admin/playlists", payload, admin_token=admin_token)

    playlist_id = int(saved_playlist["id"])
    if song_ids:
        request_json(api_base, "POST", f"/admin/playlists/{playlist_id}/songs", {"songIds": song_ids}, admin_token=admin_token)

    manifest_path = Path("/app/downloads") / f"spotify-{playlist['spotifyId']}-api-manifest.json"
    try:
        manifest_path.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass

    print(json.dumps({
        "playlistId": playlist_id,
        "name": saved_playlist.get("name"),
        "songCount": len(song_ids),
        "downloadedCount": sum(1 for entry in entries if entry.get("downloaded")),
        "manifest": str(manifest_path),
    }, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Erro fatal: {error}", file=sys.stderr)
        sys.exit(1)
