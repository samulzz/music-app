import json
import os
import re
import subprocess
import sys
import time
import unicodedata
from difflib import SequenceMatcher
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


def read_manifest(manifest_path):
    if not manifest_path.is_file():
        return []
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def write_manifest(manifest_path, entries):
    manifest_path.write_text(
        json.dumps(entries, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def normalize(value):
    decomposed = unicodedata.normalize("NFKD", (value or "").replace("\ufffd", ""))
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


def candidate_score(track, candidate):
    target_title = normalize(track["title"])
    candidate_title = normalize(candidate["title"])
    target_tokens = {token for token in target_title.split() if len(token) > 1}
    candidate_tokens = set(candidate_title.split())
    coverage = token_coverage(target_tokens, candidate_tokens)
    if coverage < 0.75:
        return -1

    primary_artist = normalize(track["artist"].split(", ")[0])
    artist_tokens = {token for token in primary_artist.split() if len(token) > 1}
    candidate_artist_text = normalize(candidate["title"] + " " + candidate["uploader"])
    artist_coverage = token_coverage(artist_tokens, set(candidate_artist_text.split()))

    expected_duration = int(track.get("durationMs") or 0) / 1000
    candidate_duration = candidate.get("duration") or 0
    duration_difference = (
        abs(expected_duration - candidate_duration)
        if expected_duration and candidate_duration else 0
    )
    if duration_difference > 75:
        return -1

    score = coverage * 100 + artist_coverage * 45
    if target_title and target_title in candidate_title:
        score += 80
    if duration_difference <= 8:
        score += 60
    elif duration_difference <= 20:
        score += 40
    elif duration_difference <= 45:
        score += 15

    unwanted = (
        "type beat",
        "react",
        "review",
        "karaoke",
        "instrumental",
        "slowed",
        "sped up",
        "remix",
    )
    if any(term in candidate_title and term not in target_title for term in unwanted):
        score -= 100
    return score


def youtube_access_args():
    args = [
        "--extractor-args",
        "youtube:lang=pt;player_client=mweb;fetch_pot=always;formats=missing_pot",
        "--sleep-requests",
        "1",
    ]
    plugin_dirs = [
        directory.strip()
        for directory in os.environ.get("YT_DLP_PLUGIN_DIRS", "").split(os.pathsep)
        if directory.strip()
    ]
    for plugin_dir in plugin_dirs:
        args.extend(["--plugin-dirs", plugin_dir])

    js_runtime = os.environ.get("YT_DLP_JS_RUNTIME", "").strip()
    if js_runtime:
        args.extend(["--no-js-runtimes", "--js-runtimes", js_runtime])

    pot_provider_url = os.environ.get("YT_DLP_POT_PROVIDER_URL", "").strip()
    if pot_provider_url:
        args.extend([
            "--extractor-args",
            "youtubepot-bgutilhttp:base_url=" + pot_provider_url,
        ])

    bgutil_server_home = os.environ.get("YT_DLP_BGUTIL_SERVER_HOME", "").strip()
    if bgutil_server_home:
        args.extend([
            "--extractor-args",
            "youtubepot-bgutilscript:server_home=" + bgutil_server_home,
        ])

    cache_dir = os.environ.get("YT_DLP_CACHE_DIR", "").strip()
    if cache_dir:
        args.extend(["--cache-dir", cache_dir])

    proxy = os.environ.get("YOUTUBE_PROXY", "").strip()
    if proxy:
        args.extend(["--proxy", proxy])

    return args


def find_candidate(yt_dlp, track):
    primary_artist = track["artist"].split(", ")[0]
    quoted_title = track["title"].replace('"', "")
    query = f'"{quoted_title}" {primary_artist}'
    command = [
        str(yt_dlp),
        "--encoding",
        "utf-8",
        *youtube_access_args(),
        "--flat-playlist",
        "--no-warnings",
        "--print",
        "%(id)s\t%(title)s\t%(uploader)s\t%(duration)s\t%(thumbnail)s",
        "ytsearch20:" + query,
    ]
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    candidates = []
    for line in result.stdout.splitlines():
        parts = line.split("\t", 4)
        if len(parts) != 5 or not re.fullmatch(r"[A-Za-z0-9_-]{11}", parts[0]):
            continue
        try:
            duration = float(parts[3]) if parts[3] not in ("", "NA", "None") else 0
        except ValueError:
            duration = 0
        candidate = {
            "id": parts[0],
            "title": parts[1],
            "uploader": parts[2],
            "duration": duration,
            "thumbnail": parts[4] if parts[4].startswith("http") else "",
        }
        candidate["score"] = candidate_score(track, candidate)
        if candidate["score"] >= 0:
            candidates.append(candidate)

    if not candidates:
        details = result.stderr.strip()
        raise RuntimeError(details[-1200:] or f"Nenhum resultado confiável para: {query}")
    return sorted(candidates, key=lambda candidate: candidate["score"], reverse=True)


def download_track(yt_dlp, ffmpeg_path, output_dir, track):
    candidates = find_candidate(yt_dlp, track)
    metadata_prefix = "NATIONMETA\t"
    last_error = None

    for candidate in candidates[:5]:
        command = [
            str(yt_dlp),
            "--encoding",
            "utf-8",
            *youtube_access_args(),
            "--no-playlist",
            "--no-warnings",
            "--socket-timeout",
            "20",
            "--retries",
            "3",
            "--sleep-requests",
            "1",
            "--match-filter",
            "duration < 600",
            "-x",
            "--audio-format",
            "mp3",
            "--audio-quality",
            "5",
            "--ffmpeg-location",
            str(ffmpeg_path),
            "--format",
            "bestaudio[ext=m4a]/bestaudio/best",
            "-o",
            str(output_dir / "%(id)s.%(ext)s"),
            "--print",
            "after_move:" + metadata_prefix + "%(id)s\t%(thumbnail)s",
            "https://www.youtube.com/watch?v=" + candidate["id"],
        ]
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        metadata_line = next(
            (line for line in result.stdout.splitlines() if line.startswith(metadata_prefix)),
            None,
        )
        if result.returncode != 0 or metadata_line is None:
            last_error = (result.stderr or result.stdout).strip()
            continue

        _, video_id, thumbnail = metadata_line.split("\t", 2)
        if not thumbnail.startswith("http"):
            thumbnail = candidate["thumbnail"]
        audio_path = output_dir / f"{video_id}.mp3"
        if not audio_path.is_file() or audio_path.stat().st_size == 0:
            last_error = f"Arquivo MP3 não encontrado para {video_id}"
            continue

        return {
            "spotifyId": track["spotifyId"],
            "sourceId": video_id,
            "title": track["title"],
            "artist": track["artist"],
            "coverUrl": thumbnail,
            "fileName": audio_path.name,
            "size": audio_path.stat().st_size,
        }

    raise RuntimeError(last_error or f"Nenhum candidato funcionou para: {track['title']}")


def main():
    if len(sys.argv) < 5:
        raise ValueError(
            "Uso: precache_spotify_playlist.py PLAYLIST_URL OUTPUT_DIR YT_DLP FFMPEG_PATH [PLAYLIST_JSON]"
        )

    playlist_url = sys.argv[1]
    output_dir = Path(sys.argv[2]).resolve()
    yt_dlp = Path(sys.argv[3]).resolve()
    ffmpeg_path = Path(sys.argv[4]).resolve()
    helper_path = Path(__file__).with_name("spotify_playlist.py")
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / "manifest.json"

    # O JSON opcional permite que o importador automatico envie somente o lote
    # pequeno escolhido para esta execucao, sem criar uma fila enorme.
    playlist_json = Path(sys.argv[5]).resolve() if len(sys.argv) > 5 else None
    if playlist_json is not None:
        playlist = json.loads(playlist_json.read_text(encoding="utf-8"))
    else:
        playlist = run_spotify_helper(helper_path, playlist_url)
    entries = read_manifest(manifest_path)
    completed_spotify_ids = {entry["spotifyId"] for entry in entries if "sourceId" in entry}

    for index, track in enumerate(playlist["tracks"], start=1):
        if track["spotifyId"] in completed_spotify_ids:
            print(f"[{index}/{len(playlist['tracks'])}] já pronta: {track['title']}", flush=True)
            continue

        print(f"[{index}/{len(playlist['tracks'])}] baixando: {track['title']}", flush=True)
        try:
            entry = download_track(yt_dlp, ffmpeg_path, output_dir, track)
            entries.append(entry)
            completed_spotify_ids.add(track["spotifyId"])
            write_manifest(manifest_path, entries)
            print(f"  OK: {entry['sourceId']} ({entry['size']} bytes)", flush=True)
        except Exception as error:
            print(f"  ERRO: {error}", flush=True)

        if index < len(playlist["tracks"]):
            time.sleep(float(os.environ.get("PRECACHE_SLEEP_SECONDS", "8")))

    successful = sum(1 for entry in entries if "sourceId" in entry)
    print(f"Concluído: {successful}/{len(playlist['tracks'])}", flush=True)
    print(manifest_path, flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Erro fatal: {error}", file=sys.stderr)
        sys.exit(1)
