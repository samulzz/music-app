package me.samulsz.musicapi.dto;

public record FriendPresenceResponse(
        String username,
        boolean online,
        boolean listening,
        long lastSeenAt,
        long lastListenedAt,
        JamSongDto song,
        double positionSeconds,
        String activeJamCode,
        String avatarIcon,
        boolean activityHidden
) {
}
