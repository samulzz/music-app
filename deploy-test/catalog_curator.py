"""Incremental catalog curation; designed for a systemd timer inside the API container.

No audio is downloaded here. Spotify tracks are kept as pending entries until an
already cached NationMusics song can be matched confidently.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.error
from collections import Counter, defaultdict
from pathlib import Path

from import_spotify_global_playlist import login_admin, request_json

API_BASE = "http://127.0.0.1:8080/api"
STATE_PATH = Path("/app/downloads/.catalog-curator-state.json")
SOURCE_PATH = Path(__file__).with_name("catalog_curator_sources.json")
HELPER_PATH = Path(__file__).with_name("spotify_playlist.py")
REFRESH_SECONDS = 6 * 60 * 60
MAX_SOURCES_PER_RUN = 2
MAX_GENRE_UPDATES = 25
MIN_AUDIO_BYTES = 512 * 1024
GENRES = {"funk", "rap", "trap", "sertanejo", "pagode", "samba", "forro", "piseiro", "gospel", "mpb", "pop", "rock", "phonk"}


def normalized(value):
    value = unicodedata.normalize("NFD", str(value or ""))
    return re.sub(r"[^a-z0-9]+", " ", "".join(ch for ch in value if not unicodedata.combining(ch)).lower()).strip()


def primary_artist(value):
    return re.split(r"\s*(?:,|\bfeat\.?\b|\bft\.?\b|\s+&\s+)\s*", str(value or ""), maxsplit=1, flags=re.I)[0].strip()


def matching_song(track, candidates):
    title = normalized(track.get("title"))
    artist = normalized(primary_artist(track.get("artist")))
    if not title or not artist:
        return None
    matches = [song for song in candidates if normalized(song.get("title")) == title
               and f" {artist} " in f" {normalized(song.get('artist'))} "]
    return matches[0] if len(matches) == 1 else None


def merge_tracks(previous, current):
    """Keep chart entries pending until their matching audio joins the catalog."""
    tracks = []
    seen = set()
    for track in [*current, *previous]:
        if not track.get("title") or not track.get("artist"):
            continue
        key = track.get("spotifyId") or (normalized(track["title"]), normalized(track["artist"]))
        if key in seen:
            continue
        seen.add(key)
        tracks.append({"spotifyId": track.get("spotifyId"), "title": track["title"], "artist": track["artist"]})
    return tracks


def cached(song):
    source_id = str(song.get("sourceId") or "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", source_id):
        return False
    path = Path("/app/downloads") / f"{source_id}.mp3"
    return path.is_file() and path.stat().st_size >= MIN_AUDIO_BYTES


def read_state():
    try:
        state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        return state if isinstance(state, dict) else {}
    except (FileNotFoundError, ValueError):
        return {}


def save_state(state):
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=STATE_PATH.parent, delete=False) as handle:
        json.dump(state, handle, ensure_ascii=False)
        temp_path = Path(handle.name)
    temp_path.replace(STATE_PATH)


def read_source(source):
    result = subprocess.run([sys.executable, str(HELPER_PATH), source["url"], "200"],
                            check=True, capture_output=True, text=True, timeout=90)
    payload = json.loads(result.stdout)
    if not isinstance(payload.get("tracks"), list):
        raise ValueError(f"Fonte {source['name']} sem faixas")
    return payload


def find_playlist(playlists, source):
    marker = f"curator:spotify:{source['id']}"
    direct = next((item for item in playlists if marker in str(item.get("description") or "")), None) or next(
        (item for item in playlists if item.get("globalPlaylist") is not False
         and normalized(item.get("name")) == normalized(source["name"])), None)
    if direct:
        return direct
    category = normalized(source.get("genre") or ("forro" if "Forró" in source["name"] else ""))
    if not category:
        return None
    alternatives = [item for item in playlists if item.get("globalPlaylist") is not False
                    and category in normalized(item.get("name")).split()]
    return max(alternatives, key=lambda item: len(item.get("songs") or []), default=None)


def ensure_playlist(source, playlists, token):
    existing = find_playlist(playlists, source)
    if existing:
        return int(existing["id"])
    payload = {"name": source["name"], "description": f"Tendências do Spotify. Atualizada automaticamente. curator:spotify:{source['id']}",
               "iconUrl": source.get("coverUrl") or None, "globalPlaylist": True}
    playlist = request_json(API_BASE, "POST", "/admin/playlists", payload, token)
    playlists.append(playlist)
    return int(playlist["id"])


def update_sources(state, token, sources, playlists):
    now = int(time.time())
    refreshed = 0
    for source in sources:
        previous = state.get("sources", {}).get(source["id"], {})
        if now - int(previous.get("refreshedAt", 0)) < REFRESH_SECONDS:
            continue
        if refreshed >= MAX_SOURCES_PER_RUN:
            break
        refreshed += 1
        try:
            playlist = read_source(source)
            if not playlist["tracks"]:
                raise ValueError("Fonte retornou lista vazia")
            playlist_id = ensure_playlist({**source, "coverUrl": playlist.get("coverUrl")}, playlists, token)
            state.setdefault("sources", {})[source["id"]] = {
                "refreshedAt": now,
                "playlistId": playlist_id,
                "tracks": merge_tracks(previous.get("tracks", []), playlist["tracks"]),
            }
            print(f"{source['name']}: {len(playlist['tracks'])} faixas de referência", flush=True)
        except Exception as error:
            print(f"{source['name']}: consulta falhou: {error}", flush=True)
    return refreshed


def reconcile(state, sources, songs, playlists, token):
    available = [song for song in songs if cached(song)]
    by_title = defaultdict(list)
    for song in available:
        by_title[normalized(song.get("title"))].append(song)
    playlist_by_id = {int(item["id"]): item for item in playlists}
    genre_evidence = defaultdict(set)
    pending = 0
    additions = 0
    for source in sources:
        record = state.get("sources", {}).get(source["id"])
        if not record or not record.get("playlistId"):
            continue
        playlist_id = int(record["playlistId"])
        existing_ids = {int(song["id"]) for song in playlist_by_id.get(playlist_id, {}).get("songs", [])}
        new_ids = []
        for track in record.get("tracks", []):
            song = matching_song(track, by_title.get(normalized(track.get("title")), []))
            if not song:
                pending += 1
                continue
            song_id = int(song["id"])
            if source.get("genre") in GENRES:
                genre_evidence[song_id].add(source["genre"])
            if song_id not in existing_ids:
                new_ids.append(song_id)
                existing_ids.add(song_id)
        if new_ids:
            request_json(API_BASE, "POST", f"/admin/playlists/{playlist_id}/songs", {"songIds": new_ids}, token)
            additions += len(new_ids)
    return genre_evidence, pending, additions


def update_genres(songs, evidence, token, state):
    artist_votes = defaultdict(Counter)
    for song in songs:
        genres = set(song.get("genres") or []) | evidence.get(int(song["id"]), set())
        for genre in genres & GENRES:
            artist_votes[normalized(primary_artist(song.get("artist")))][genre] += 1
    ordered = sorted(songs, key=lambda song: int(song["id"]))
    cursor = int(state.get("genreCursor", 0))
    ordered = [song for song in ordered if int(song["id"]) > cursor] + [song for song in ordered if int(song["id"]) <= cursor]
    updated = 0
    checked = 0
    for song in ordered:
        checked += 1
        state["genreCursor"] = int(song["id"])
        if not cached(song):
            continue
        current = set(song.get("genres") or [])
        proposed = set(evidence.get(int(song["id"]), set()))
        if not current and not proposed:
            votes = artist_votes[normalized(primary_artist(song.get("artist")))]
            total = sum(votes.values())
            if total >= 3:
                proposed = {genre for genre, count in votes.items() if count >= 3 and count / total >= 0.7}
        if proposed - current:
            request_json(API_BASE, "POST", "/admin/songs/import",
                         {"sourceId": song["sourceId"], "title": song["title"], "artist": song["artist"],
                          "genres": sorted(current | proposed)}, token)
            updated += 1
        if updated >= MAX_GENRE_UPDATES or checked >= 500:
            break
    return updated


def main():
    sources = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))["sources"]
    state = read_state()
    for attempt in range(25):
        try:
            token = login_admin(API_BASE)
            break
        except urllib.error.URLError:
            if attempt == 24:
                raise
            time.sleep(3)
    playlists = request_json(API_BASE, "GET", "/admin/playlists", admin_token=token)
    refreshed = update_sources(state, token, sources, playlists)
    save_state(state)
    songs = request_json(API_BASE, "GET", "/admin/songs/search?q=", admin_token=token)
    evidence, pending, additions = reconcile(state, sources, songs, playlists, token)
    updated = update_genres(songs, evidence, token, state)
    save_state(state)
    print(f"Ciclo concluído: fontes={refreshed}, pendentes={pending}, músicas adicionadas={additions}, gêneros atualizados={updated}", flush=True)


if __name__ == "__main__":
    main()
