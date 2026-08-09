package me.samulsz.musicapi.dto;

public record UserProfileUpdateRequest(
        String avatarIcon,
        Boolean showOnlineStatus,
        Boolean showListeningActivity,
        Boolean showLastSeen,
        Boolean showActiveJam
) {
}
