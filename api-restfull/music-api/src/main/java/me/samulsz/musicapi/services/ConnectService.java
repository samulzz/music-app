package me.samulsz.musicapi.services;

import me.samulsz.musicapi.dto.*;
import me.samulsz.musicapi.models.AccountPlayback;
import me.samulsz.musicapi.models.PlaybackDevice;
import me.samulsz.musicapi.models.User;
import me.samulsz.musicapi.repositories.AccountPlaybackRepository;
import me.samulsz.musicapi.repositories.PlaybackDeviceRepository;
import me.samulsz.musicapi.repositories.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
@Transactional
public class ConnectService {
    // O Android pode suspender timers JavaScript enquanto o player segue tocando em
    // segundo plano. Mantemos aparelhos vistos recentemente na lista para que o PC
    // não faça o celular "sumir" durante esse período.
    private static final long DEVICE_VISIBLE_MS = Duration.ofMinutes(3).toMillis();
    private static final Set<String> ACTIONS = Set.of("PLAY", "PAUSE", "NEXT", "PREVIOUS", "SEEK", "VOLUME", "SYNC");
    private final UserRepository users;
    private final AccountPlaybackRepository playbacks;
    private final PlaybackDeviceRepository devices;

    public ConnectService(UserRepository users, AccountPlaybackRepository playbacks, PlaybackDeviceRepository devices) {
        this.users = users;
        this.playbacks = playbacks;
        this.devices = devices;
    }

    public ConnectStateResponse heartbeat(String username, ConnectHeartbeatRequest request) {
        User user = user(username);
        String deviceId = required(request == null ? null : request.deviceId(), "Identificador do dispositivo ausente.");
        long now = System.currentTimeMillis();
        PlaybackDevice device = devices.findByUser_IdAndDeviceId(user.getId(), deviceId).orElseGet(() -> {
            PlaybackDevice next = new PlaybackDevice();
            next.setUser(user);
            next.setDeviceId(deviceId);
            return next;
        });
        device.setDeviceName(clean(request.deviceName()).isEmpty() ? "Dispositivo" : clean(request.deviceName()));
        device.setPlatform(clean(request.platform()).isEmpty() ? "unknown" : clean(request.platform()));
        device.setLastSeenAt(now);
        device.setProcessedCommandRevision(Math.max(
                device.getProcessedCommandRevision(),
                Math.max(0, request.processedCommandRevision() == null ? 0 : request.processedCommandRevision())
        ));
        devices.save(device);

        AccountPlayback playback = state(user);
        // Um heartbeat passivo nunca assume a reprodução. Mesmo que o aparelho ativo
        // esteja temporariamente suspenso pelo Android, a troca só ocorre por ação do usuário.
        // Só a reprodução real ou uma transferência explícita escolhe o aparelho.
        // Abrir dois apps parados não deve eleger um deles como "reproduzindo".
        if (playback.getActiveDeviceId().isBlank()
                && request.song() != null
                && Boolean.TRUE.equals(request.playing())) {
            playback.setActiveDeviceId(deviceId);
        }
        if (deviceId.equals(playback.getActiveDeviceId())) {
            if (request.song() != null) {
                writeSong(playback, request.song());
                playback.setPositionSeconds(Math.max(0, value(request.positionSeconds(), playback.getPositionSeconds())));
                playback.setDurationSeconds(Math.max(0, value(request.durationSeconds(), playback.getDurationSeconds())));
                playback.setPlaying(Boolean.TRUE.equals(request.playing()));
                playback.setVolumeLevel(clamp(value(request.volumeLevel(), playback.getVolumeLevel()), 0, 1));
            } else {
                // Sem fila local, encerra a sessão daquele aparelho em vez de manter um
                // dispositivo fantasma como ativo.
                playback.setPlaying(false);
                clearSong(playback);
                playback.setActiveDeviceId("");
            }
            playback.setStateUpdatedAt(now);
        }
        playbacks.save(playback);
        return response(user, playback, deviceId, device.getProcessedCommandRevision(), now);
    }

    @Transactional(readOnly = true)
    public ConnectStateResponse get(String username, String deviceId, long processedRevision) {
        User user = user(username);
        AccountPlayback playback = playbacks.findByUser_Id(user.getId()).orElseGet(() -> emptyState(user));
        return response(user, playback, clean(deviceId), Math.max(0, processedRevision), System.currentTimeMillis());
    }

    public ConnectStateResponse control(String username, ConnectControlRequest request) {
        User user = user(username);
        String sourceDeviceId = required(request == null ? null : request.deviceId(), "Identificador do dispositivo ausente.");
        AccountPlayback playback = state(user);
        String action = clean(request.action()).toUpperCase(Locale.ROOT);
        if (!ACTIONS.contains(action)) throw new IllegalArgumentException("Comando de reprodução inválido.");
        long now = System.currentTimeMillis();

        if ("SYNC".equals(action)) {
            playback.setActiveDeviceId(sourceDeviceId);
            if (request.song() != null) writeSong(playback, request.song());
            playback.setCommandTargetDeviceId(sourceDeviceId);
        } else {
            if (playback.getActiveDeviceId().isBlank()) playback.setActiveDeviceId(sourceDeviceId);
            playback.setCommandTargetDeviceId(playback.getActiveDeviceId());
        }
        playback.setCommandAction(action);
        playback.setCommandValue(value(request.value(), 0));
        playback.setCommandRevision(playback.getCommandRevision() + 1);
        if ("PLAY".equals(action)) playback.setPlaying(true);
        if ("PAUSE".equals(action)) playback.setPlaying(false);
        if ("SEEK".equals(action)) playback.setPositionSeconds(Math.max(0, value(request.value(), 0)));
        if ("VOLUME".equals(action)) playback.setVolumeLevel(clamp(value(request.value(), playback.getVolumeLevel()), 0, 1));
        playback.setStateUpdatedAt(now);
        playbacks.save(playback);
        return response(user, playback, sourceDeviceId, 0, now);
    }

    private ConnectStateResponse response(User user, AccountPlayback playback, String currentDeviceId, long processedRevision, long now) {
        Map<String, PlaybackDevice> uniqueDevices = new LinkedHashMap<>();
        devices.findByUser_IdOrderByLastSeenAtDesc(user.getId()).stream()
                .filter(device -> device.getDeviceId().equals(playback.getActiveDeviceId()) || now - device.getLastSeenAt() <= DEVICE_VISIBLE_MS)
                .forEach(device -> {
                    String key = clean(device.getPlatform()).toLowerCase(Locale.ROOT) + "|" + clean(device.getDeviceName()).toLowerCase(Locale.ROOT);
                    PlaybackDevice current = uniqueDevices.get(key);
                    if (current == null || device.getDeviceId().equals(playback.getActiveDeviceId())) uniqueDevices.put(key, device);
                });
        List<ConnectDeviceResponse> online = uniqueDevices.values().stream()
                .map(device -> new ConnectDeviceResponse(device.getDeviceId(), device.getDeviceName(), device.getPlatform(), device.getDeviceId().equals(playback.getActiveDeviceId()), device.getLastSeenAt()))
                .toList();
        boolean commandPending = currentDeviceId.equals(playback.getCommandTargetDeviceId()) && playback.getCommandRevision() > processedRevision;
        return new ConnectStateResponse(
                playback.getActiveDeviceId(), currentDeviceId.equals(playback.getActiveDeviceId()), online,
                readSong(playback), playback.getPositionSeconds(), playback.getDurationSeconds(), playback.isPlaying(), playback.getVolumeLevel(),
                playback.getStateUpdatedAt(), commandPending ? playback.getCommandAction() : "", playback.getCommandValue(),
                playback.getCommandRevision(), now
        );
    }

    private AccountPlayback state(User user) {
        return playbacks.findByUser_Id(user.getId()).orElseGet(() -> playbacks.save(emptyState(user)));
    }
    private AccountPlayback emptyState(User user) { AccountPlayback value = new AccountPlayback(); value.setUser(user); value.setStateUpdatedAt(System.currentTimeMillis()); return value; }
    private User user(String username) { return users.findByUsername(username).orElseThrow(() -> new IllegalArgumentException("Usuário não encontrado.")); }
    private void writeSong(AccountPlayback state, ConnectSongDto song) {
        state.setSongId(clean(song.id())); state.setSongSourceId(clean(song.sourceId())); state.setSongTitle(clean(song.title()));
        state.setSongArtist(clean(song.artist())); state.setSongArtworkUrl(clean(song.artworkUrl())); state.setSongRemoteUrl(clean(song.remoteUrl()));
    }
    private void clearSong(AccountPlayback state) {
        state.setSongId(""); state.setSongSourceId(""); state.setSongTitle("");
        state.setSongArtist(""); state.setSongArtworkUrl(""); state.setSongRemoteUrl("");
        state.setPositionSeconds(0); state.setDurationSeconds(0);
    }
    private ConnectSongDto readSong(AccountPlayback state) {
        if (state.getSongId().isBlank() && state.getSongSourceId().isBlank()) return null;
        return new ConnectSongDto(state.getSongId(), state.getSongSourceId(), state.getSongTitle(), state.getSongArtist(), state.getSongArtworkUrl(), state.getSongRemoteUrl());
    }
    private String required(String value, String message) { String result = clean(value); if (result.isEmpty()) throw new IllegalArgumentException(message); return result; }
    private String clean(String value) { return value == null ? "" : value.trim(); }
    private double value(Double value, double fallback) { return value == null || !Double.isFinite(value) ? fallback : value; }
    private double clamp(double value, double min, double max) { return Math.max(min, Math.min(max, value)); }
}
