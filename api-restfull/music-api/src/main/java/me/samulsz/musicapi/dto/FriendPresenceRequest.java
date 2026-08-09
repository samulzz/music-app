package me.samulsz.musicapi.dto;

public record FriendPresenceRequest(
        JamSongDto song,
        Boolean playing,
        Double positionSeconds,
        String activeJamCode
) {
}
