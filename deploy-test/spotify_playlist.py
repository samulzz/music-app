import json
import re
import sys

from spotify_scraper import SpotifyClient


RESOURCE_PATTERN = re.compile(
    r"(?:open\.spotify\.com/(?:intl-[a-z]{2}/)?(playlist|album|track)/"
    r"|spotify:(playlist|album|track):)([A-Za-z0-9]{22})",
    re.IGNORECASE,
)


def resource_type(url):
    match = RESOURCE_PATTERN.search(url)
    if not match:
        raise ValueError("Link do Spotify inválido. Use uma música, álbum ou playlist.")
    return (match.group(1) or match.group(2)).lower()


def serialize_track(track):
    return {
        "spotifyId": track.id,
        "title": track.name,
        "artist": ", ".join(artist.name for artist in track.artists),
        "durationMs": track.duration_ms,
    }


def main():
    if len(sys.argv) < 2:
        raise ValueError("Link do Spotify não informado.")

    url = sys.argv[1]
    limit = min(max(int(sys.argv[2]) if len(sys.argv) > 2 else 200, 1), 200)
    kind = resource_type(url)

    with SpotifyClient(timeout=25) as client:
        if kind == "playlist":
            entity = client.get_playlist(url, max_tracks=limit)
            source_tracks = [item.track for item in entity.tracks[:limit]]
            total_tracks = entity.total_tracks or len(source_tracks)
        elif kind == "album":
            entity = client.get_album(url)
            source_tracks = list(entity.tracks[:limit])
            total_tracks = entity.total_tracks or len(entity.tracks)
        else:
            entity = client.get_track(url)
            source_tracks = [entity]
            total_tracks = 1

    tracks = [serialize_track(track) for track in source_tracks]
    images = entity.images
    if kind == "track" and not images and entity.album:
        images = entity.album.images
    cover_url = images[0].url if images else ""
    print(json.dumps({
        "spotifyId": entity.id,
        "type": kind,
        "name": entity.name,
        "coverUrl": cover_url,
        "totalTracks": total_tracks,
        "truncated": total_tracks > limit,
        "tracks": tracks,
    }, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        sys.exit(1)
