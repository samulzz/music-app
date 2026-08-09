package me.samulsz.musicapi.dto;

import java.util.List;

public record SpotifyPlaylistResponse(
        String spotifyId,
        String type,
        String name,
        String coverUrl,
        int totalTracks,
        boolean truncated,
        List<SpotifyPlaylistTrack> tracks
) {
}
