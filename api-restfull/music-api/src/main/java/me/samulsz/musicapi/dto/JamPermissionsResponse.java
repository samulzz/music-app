package me.samulsz.musicapi.dto;

public record JamPermissionsResponse(
        boolean allowParticipantControl,
        boolean allowParticipantQueue,
        boolean syncVolume
) {
}
