package me.samulsz.musicapi.dto;

public record AlbumSummaryResponse(
        String name,
        String artist,
        String coverUrl,
        int songCount,
        Long playlistId
) {}
