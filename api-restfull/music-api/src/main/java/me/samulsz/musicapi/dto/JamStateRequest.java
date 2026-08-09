package me.samulsz.musicapi.dto;

public record JamStateRequest(
        JamSongDto song,
        Double positionSeconds,
        Boolean playing,
        Double volumeLevel
) {
}
