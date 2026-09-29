package me.samulsz.musicapi.dto;

public record PlaybackReportRequest(
        Long songId,
        String sourceId,
        long listenedSeconds,
        boolean completed,
        double durationSeconds,
        String outcome
) {}
