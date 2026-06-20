package me.samulsz.musicapi.dto;

public record SpotifyPlaylistTrack(
        String spotifyId,
        String title,
        String artist,
        int durationMs
) {
}
