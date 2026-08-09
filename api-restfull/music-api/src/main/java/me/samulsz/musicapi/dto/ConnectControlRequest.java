package me.samulsz.musicapi.dto;
public record ConnectControlRequest(String deviceId, String action, Double value, ConnectSongDto song) {}
