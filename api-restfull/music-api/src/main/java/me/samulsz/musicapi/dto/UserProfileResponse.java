package me.samulsz.musicapi.dto;

public record UserProfileResponse(
        String username,
        String avatarIcon,
        boolean showOnlineStatus,
        boolean showListeningActivity,
        boolean showLastSeen,
        boolean showActiveJam,
        FriendPresenceResponse presence
) {
}
