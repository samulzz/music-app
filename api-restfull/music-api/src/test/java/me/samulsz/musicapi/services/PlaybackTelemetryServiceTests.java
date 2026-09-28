package me.samulsz.musicapi.services;

import me.samulsz.musicapi.dto.PlaybackTelemetryRequest;
import me.samulsz.musicapi.models.PlaybackTelemetry;
import me.samulsz.musicapi.models.User;
import me.samulsz.musicapi.repositories.PlaybackTelemetryRepository;
import me.samulsz.musicapi.repositories.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PlaybackTelemetryServiceTests {
    private final List<PlaybackTelemetry> stored = new ArrayList<>();
    private PlaybackTelemetryService service;

    @BeforeEach
    void setUp() {
        User user = new User(); user.setId(7L); user.setUsername("ouvinte"); user.setPassword("teste");
        UserRepository users = mock(UserRepository.class);
        PlaybackTelemetryRepository events = mock(PlaybackTelemetryRepository.class);
        when(users.findByUsername("ouvinte")).thenReturn(Optional.of(user));
        when(events.save(any(PlaybackTelemetry.class))).thenAnswer(invocation -> {
            PlaybackTelemetry event = invocation.getArgument(0); stored.add(event); return event;
        });
        when(events.findByOccurredAtGreaterThanEqualOrderByOccurredAtDesc(any(), any(Pageable.class)))
                .thenAnswer(invocation -> stored.stream()
                        .filter(event -> event.getOccurredAt() >= invocation.<Long>getArgument(0))
                        .sorted(Comparator.comparingLong(PlaybackTelemetry::getOccurredAt).reversed())
                        .toList());
        service = new PlaybackTelemetryService(events, users);
    }

    @Test
    void aggregatesLoadTimeAndRanksProblemSongs() {
        record("session-1", "Faixa boa", "READY", 1_000L);
        record("session-2", "Faixa ruim", "READY", 9_000L);
        record("session-2", "Faixa ruim", "WAITING", null);
        record("session-2", "Faixa ruim", "ERROR", null);

        var dashboard = service.dashboard(24);
        assertEquals(5_000D, dashboard.summary().averageLoadMs());
        assertEquals(9_000L, dashboard.summary().p95LoadMs());
        assertEquals(2, dashboard.summary().incidents());
        assertEquals("Faixa ruim", dashboard.problematicSongs().getFirst().title());
        assertEquals(1, dashboard.problematicSongs().getFirst().errors());
    }

    @Test
    void rejectsUnknownEventTypes() {
        assertThrows(IllegalArgumentException.class, () -> record("session-1", "Faixa", "HACK", null));
    }

    private void record(String session, String title, String event, Long loadMs) {
        PlaybackTelemetryRequest request = new PlaybackTelemetryRequest();
        request.setSessionId(session); request.setSourceId(title.toLowerCase().replace(' ', '-'));
        request.setTitle(title); request.setArtist("Artista"); request.setEventType(event);
        request.setPlatform("desktop"); request.setAppVersion("1.0.0"); request.setLoadTimeMs(loadMs);
        service.record("ouvinte", request);
    }
}
