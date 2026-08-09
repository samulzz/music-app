package me.samulsz.musicapi.dto;
public record ConnectHeartbeatRequest(String deviceId, String deviceName, String platform, ConnectSongDto song, Double positionSeconds, Double durationSeconds, Boolean playing, Double volumeLevel, Long processedCommandRevision) {}
