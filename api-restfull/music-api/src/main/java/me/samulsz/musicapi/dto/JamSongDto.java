package me.samulsz.musicapi.dto;

public record JamSongDto(
        String id,
        String sourceId,
        String title,
        String artist,
        String artworkUrl,
        String remoteUrl
) {
}
