package me.samulsz.musicapi.dto;

public record JamSettingsRequest(
        Boolean allowParticipantControl,
        Boolean allowParticipantQueue,
        Boolean syncVolume,
        Double volumeLevel
) {
}
