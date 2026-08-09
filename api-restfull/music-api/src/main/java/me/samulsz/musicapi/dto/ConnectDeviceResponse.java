package me.samulsz.musicapi.dto;
public record ConnectDeviceResponse(String deviceId, String deviceName, String platform, boolean active, long lastSeenAt) {}
