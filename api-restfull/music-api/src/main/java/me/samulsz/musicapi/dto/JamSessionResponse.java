package me.samulsz.musicapi.dto;

import java.util.List;

public record JamSessionResponse(
        String code,
        String inviteLink,
        String hostUsername,
        List<String> participants,
        JamPlaybackState state,
        long serverTime,
        boolean owner,
        boolean canControl,
        boolean canManage,
        boolean canQueue,
        JamPermissionsResponse permissions,
        List<JamParticipantResponse> participantDetails,
        List<JamSongDto> queue,
        double volumeLevel
) {
}
