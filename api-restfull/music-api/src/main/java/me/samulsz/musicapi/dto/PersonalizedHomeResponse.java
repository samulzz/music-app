package me.samulsz.musicapi.dto;

import me.samulsz.musicapi.models.Song;

import java.util.List;

public record PersonalizedHomeResponse(
        ContinueListening continueListening,
        List<Song> recentSongs,
        List<ArtistSummary> topArtists,
        List<Song> recommendedSongs,
        List<PlaylistSummary> frequentPlaylists,
        String recommendationReason,
        DailyMixResponse dailyMix
) {
    public record ContinueListening(
            ConnectSongDto song,
            double positionSeconds,
            double durationSeconds,
            long updatedAt,
            String contextType,
            String contextId,
            String contextName
    ) {}

    public record ArtistSummary(String name, String artworkUrl, long score) {}

    public record PlaylistSummary(Long id, String name, String description, String iconUrl) {}
}
