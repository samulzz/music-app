package me.samulsz.musicapi.dto;
import java.util.List;
public record ConnectStateResponse(String activeDeviceId, boolean currentDeviceActive, List<ConnectDeviceResponse> devices, ConnectSongDto song, double positionSeconds, double durationSeconds, boolean playing, double volumeLevel, long stateUpdatedAt, String commandAction, double commandValue, long commandRevision, long serverTime) {}
