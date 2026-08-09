package me.samulsz.musicapi.dto;

public record JamPlaybackState(
        JamSongDto song,
        double positionSeconds,
        boolean playing,
        long updatedAt,
        double volumeLevel
) {
}
