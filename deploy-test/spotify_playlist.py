import json
import sys

from spotify_scraper import SpotifyClient


def main():
    if len(sys.argv) < 2:
        raise ValueError("Link da playlist não informado.")

    url = sys.argv[1]
    limit = min(max(int(sys.argv[2]) if len(sys.argv) > 2 else 200, 1), 200)
    playlist = SpotifyClient(timeout=25).get_playlist(url, max_tracks=limit)

    tracks = []
    for item in playlist.tracks[:limit]:
        track = item.track
        artists = ", ".join(artist.name for artist in track.artists)
        tracks.append({
            "spotifyId": track.id,
            "title": track.name,
            "artist": artists,
            "durationMs": track.duration_ms,
        })

    cover_url = playlist.images[0].url if playlist.images else ""
    print(json.dumps({
        "spotifyId": playlist.id,
        "name": playlist.name,
        "coverUrl": cover_url,
        "totalTracks": playlist.total_tracks,
        "truncated": playlist.total_tracks > limit,
        "tracks": tracks,
    }, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        sys.exit(1)
