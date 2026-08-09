package me.samulsz.musicapi.dto;

public record FriendUserResponse(
        String username,
        String relationship,
        Long requestId,
        boolean requestedByMe,
        FriendPresenceResponse presence
) {
}
