package me.samulsz.musicapi.dto;

public record JamParticipantResponse(
        String username,
        boolean owner,
        boolean active,
        long joinedAt,
        long lastSeenAt
) {
}
