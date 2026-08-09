package me.samulsz.musicapi.services;

import me.samulsz.musicapi.dto.ConnectControlRequest;
import me.samulsz.musicapi.dto.ConnectHeartbeatRequest;
import me.samulsz.musicapi.dto.ConnectSongDto;
import me.samulsz.musicapi.models.AccountPlayback;
import me.samulsz.musicapi.models.PlaybackDevice;
import me.samulsz.musicapi.models.User;
import me.samulsz.musicapi.repositories.AccountPlaybackRepository;
import me.samulsz.musicapi.repositories.PlaybackDeviceRepository;
import me.samulsz.musicapi.repositories.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ConnectServiceTests {
    private final User user = new User();
    private final List<PlaybackDevice> storedDevices = new ArrayList<>();
    private AccountPlayback storedPlayback;
    private ConnectService service;

    @BeforeEach
    void setUp() {
        user.setId(10L);
        user.setUsername("ouvinte");
        user.setPassword("teste");

        UserRepository users = mock(UserRepository.class);
        AccountPlaybackRepository playbacks = mock(AccountPlaybackRepository.class);
        PlaybackDeviceRepository devices = mock(PlaybackDeviceRepository.class);

        when(users.findByUsername("ouvinte")).thenReturn(Optional.of(user));
        when(playbacks.findByUser_Id(10L)).thenAnswer(invocation -> Optional.ofNullable(storedPlayback));
        when(playbacks.save(any(AccountPlayback.class))).thenAnswer(invocation -> storedPlayback = invocation.getArgument(0));
        when(devices.findByUser_IdAndDeviceId(any(), any())).thenAnswer(invocation -> storedDevices.stream()
                .filter(device -> device.getDeviceId().equals(invocation.getArgument(1)))
                .findFirst());
        when(devices.save(any(PlaybackDevice.class))).thenAnswer(invocation -> {
            PlaybackDevice value = invocation.getArgument(0);
            if (!storedDevices.contains(value)) storedDevices.add(value);
            return value;
        });
        when(devices.findByUser_IdOrderByLastSeenAtDesc(10L)).thenAnswer(invocation -> List.copyOf(storedDevices));
        service = new ConnectService(users, playbacks, devices);
    }

    @Test
    void passiveHeartbeatNeverChangesTheChosenDevice() {
        var desktop = heartbeat("desktop", song(), true, 0L);
        var mobile = heartbeat("mobile", null, false, 0L);

        assertEquals("desktop", desktop.activeDeviceId());
        assertEquals("desktop", mobile.activeDeviceId());
        assertFalse(mobile.currentDeviceActive());

        var transferred = service.control("ouvinte", new ConnectControlRequest("mobile", "SYNC", 0D, null));
        assertEquals("mobile", transferred.activeDeviceId());
        assertTrue(transferred.currentDeviceActive());
    }

    @Test
    void processedRevisionDoesNotGoBackwardsAfterAppRestart() {
        heartbeat("desktop", song(), true, 0L);
        var command = service.control("ouvinte", new ConnectControlRequest("mobile", "PAUSE", 0D, null));
        var pending = service.get("ouvinte", "desktop", 0L);
        assertEquals("PAUSE", pending.commandAction());

        var acknowledged = heartbeat("desktop", song(), false, command.commandRevision());
        assertEquals("", acknowledged.commandAction());

        var restarted = heartbeat("desktop", song(), false, 0L);
        assertEquals("", restarted.commandAction());
        assertEquals(command.commandRevision(), restarted.commandRevision());
    }

    @Test
    void openingActiveAppWithoutQueueDoesNotResumeOldPlayback() {
        assertTrue(heartbeat("desktop", song(), true, 0L).playing());
        var idle = heartbeat("desktop", null, null, 0L);
        assertFalse(idle.playing());
        assertEquals("", idle.activeDeviceId());
        assertEquals(null, idle.song());
    }

    private me.samulsz.musicapi.dto.ConnectStateResponse heartbeat(String id, ConnectSongDto song, Boolean playing, Long revision) {
        return service.heartbeat("ouvinte", new ConnectHeartbeatRequest(
                id, id, id.equals("desktop") ? "desktop" : "android", song,
                15D, 180D, playing, 0.7D, revision
        ));
    }

    private ConnectSongDto song() {
        return new ConnectSongDto("1", "source-1", "Faixa", "Artista", "", "https://example.test/audio.mp3");
    }
}
