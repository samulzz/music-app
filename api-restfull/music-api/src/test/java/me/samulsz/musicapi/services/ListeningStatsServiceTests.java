package me.samulsz.musicapi.services;

import me.samulsz.musicapi.models.*;
import me.samulsz.musicapi.repositories.*;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class ListeningStatsServiceTests {
    final ListeningEventRepository events = mock(ListeningEventRepository.class);
    final UserRepository users = mock(UserRepository.class);
    final SongRepository songs = mock(SongRepository.class);
    final ListeningStatsService service = new ListeningStatsService(events, users, songs);

    User user() {
        User user = new User(); user.setId(7L);
        when(users.findByUsername("ouvinte")).thenReturn(Optional.of(user));
        when(users.findByUsernameForUpdate("ouvinte")).thenReturn(Optional.of(user));
        return user;
    }
    ListeningEvent event(long songId, int seconds, String date) {
        ListeningEvent e = new ListeningEvent(); e.songId = songId; e.title = "Música " + songId;
        e.artist = "Cantor"; e.genres = "Trap,Rap"; e.sessionId = "sessão" + songId;
        e.seconds = seconds; e.occurredAt = Instant.parse(date).toEpochMilli(); return e;
    }
    @Test void totalsAndGenresUseOnlyUserMonthWithSaoPauloBoundaries() {
        user();
        var a = event(1, 60, "2026-09-01T03:00:00Z");
        var b = event(1, 60, "2026-09-02T03:00:00Z");
        var c = event(2, 61, "2026-09-02T03:01:00Z");
        when(events.findByUserIdAndOccurredAtGreaterThanEqualAndOccurredAtLessThan(eq(7L), anyLong(), anyLong()))
                .thenReturn(List.of(a,b,c));
        when(events.findFirstByUserIdOrderByOccurredAtAsc(7L)).thenReturn(a);
        var result = service.monthly("ouvinte", "2026-09");
        assertEquals(181, result.seconds()); assertEquals(3, result.minutes());
        assertEquals(2, result.songs()); assertEquals(1, result.artists());
        assertEquals(2, result.activeDays()); assertEquals(2, result.plays());
        assertEquals(181, result.topGenres().stream().mapToLong(ListeningStatsService.Rank::seconds).sum());
        assertEquals("Música 1", result.topSongs().getFirst().name());
        verify(events).findByUserIdAndOccurredAtGreaterThanEqualAndOccurredAtLessThan(7L,
                Instant.parse("2026-09-01T03:00:00Z").toEpochMilli(),
                Instant.parse("2026-10-01T03:00:00Z").toEpochMilli());
    }
    @Test void retriesAreIdempotent() {
        user(); String id = UUID.randomUUID().toString();
        when(events.existsById(id)).thenReturn(true);
        service.record("ouvinte", new ListeningStatsService.Listen(id, UUID.randomUUID().toString(), 1L, null, 30, System.currentTimeMillis()));
        verify(events, never()).save(any()); verifyNoInteractions(songs);
    }
    @Test void rejectsInflatedIntervals() {
        assertThrows(IllegalArgumentException.class, () -> service.record("ouvinte",
                new ListeningStatsService.Listen(UUID.randomUUID().toString(), UUID.randomUUID().toString(), 1L, null, 600, System.currentTimeMillis())));
        verifyNoInteractions(events,users,songs);
    }
}
