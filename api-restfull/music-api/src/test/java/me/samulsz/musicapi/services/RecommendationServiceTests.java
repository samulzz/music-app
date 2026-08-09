package me.samulsz.musicapi.services;

import me.samulsz.musicapi.models.DailyMix;
import me.samulsz.musicapi.models.Song;
import me.samulsz.musicapi.models.User;
import me.samulsz.musicapi.repositories.DailyMixRepository;
import me.samulsz.musicapi.repositories.PlaybackPreferenceRepository;
import me.samulsz.musicapi.repositories.PlaylistRepository;
import me.samulsz.musicapi.repositories.SongRepository;
import me.samulsz.musicapi.repositories.UserRepository;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RecommendationServiceTests {

    @Test
    void createsAndReusesDailyMixWithAtMostOneHundredSongs() {
        UserRepository users = mock(UserRepository.class);
        SongRepository songs = mock(SongRepository.class);
        PlaylistRepository playlists = mock(PlaylistRepository.class);
        PlaybackPreferenceRepository preferences = mock(PlaybackPreferenceRepository.class);
        DailyMixRepository dailyMixes = mock(DailyMixRepository.class);
        MusicService music = mock(MusicService.class);

        User user = new User();
        user.setId(7L);
        user.setUsername("ouvinte");
        user.setDownloadedSongs(new HashSet<>());
        List<Song> catalog = new ArrayList<>();
        for (long id = 1; id <= 125; id++) {
            Song song = new Song();
            song.setId(id);
            song.setTitle("Musica " + id);
            song.setArtist("Artista " + (id % 20));
            song.setSourceId("source-" + id);
            catalog.add(song);
        }

        when(users.findByUsername("ouvinte")).thenReturn(Optional.of(user));
        when(songs.findAll()).thenReturn(catalog);
        when(songs.findMostDownloadedSongs()).thenReturn(List.of());
        when(playlists.findAll()).thenReturn(List.of());
        when(preferences.findByUserIdOrderByLastListenedAtDesc(7L)).thenReturn(List.of());
        when(dailyMixes.findByUserIdAndMixDate(any(), any())).thenReturn(Optional.empty());
        when(dailyMixes.findTopByUserIdAndMixDateBeforeOrderByMixDateDesc(any(), any()))
                .thenReturn(Optional.empty());
        when(dailyMixes.save(any(DailyMix.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(music.hasPrecachedAudio(any())).thenReturn(true);

        RecommendationService service = new RecommendationService(
                users, songs, playlists, preferences, dailyMixes, music
        );
        var response = service.getDailyMix("ouvinte");

        assertEquals(100, response.songs().size());
        assertEquals(LocalDate.now(), response.generatedFor());
        assertNotNull(response.name());
    }
}
