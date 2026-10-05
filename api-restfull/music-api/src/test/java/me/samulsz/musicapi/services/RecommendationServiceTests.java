package me.samulsz.musicapi.services;

import me.samulsz.musicapi.models.DailyMix;
import me.samulsz.musicapi.models.Song;
import me.samulsz.musicapi.models.PlaybackPreference;
import me.samulsz.musicapi.dto.RecommendationFeedbackRequest;
import me.samulsz.musicapi.models.User;
import me.samulsz.musicapi.repositories.DailyMixRepository;
import me.samulsz.musicapi.repositories.AccountPlaybackRepository;
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
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RecommendationServiceTests {

    @Test void radioKeepsContextAndExcludesBlockedAndUnavailableSongs() {
        var users = mock(UserRepository.class); var songs = mock(SongRepository.class);
        var playlists = mock(PlaylistRepository.class); var preferences = mock(PlaybackPreferenceRepository.class);
        var mixes = mock(DailyMixRepository.class); var playback = mock(AccountPlaybackRepository.class);
        var music = mock(MusicService.class);
        var user = new User(); user.setId(7L); user.setDownloadedSongs(new HashSet<>());
        var catalog = new ArrayList<Song>();
        for (long id = 1; id <= 5; id++) {
            var song = new Song(); song.setId(id); song.setTitle("Track " + id); song.setSourceId("source-" + id);
            song.setArtist(id <= 2 ? "Alee" : "Outro " + id); song.setGenres(java.util.Set.of(id <= 2 ? "Trap" : "Pagode")); catalog.add(song);
        }
        var blocked = new PlaybackPreference(); blocked.setSong(catalog.get(2)); blocked.setDoNotRecommend(true);
        when(users.findByUsername("ouvinte")).thenReturn(Optional.of(user));
        when(songs.findBySourceId("source-1")).thenReturn(Optional.of(catalog.getFirst()));
        when(songs.findAll()).thenReturn(catalog);
        when(preferences.findByUserIdOrderByLastListenedAtDesc(7L)).thenReturn(List.of(blocked));
        when(music.hasPrecachedAudio(any())).thenAnswer(i -> !"source-5".equals(i.getArgument(0)));
        var service = new RecommendationService(users, songs, playlists, preferences, mixes, playback, music);
        var result = service.radio("ouvinte", "source-1", 30);
        assertEquals(2L, result.getFirst().getId());
        assertFalse(result.stream().anyMatch(s -> java.util.Set.of(1L, 3L, 5L).contains(s.getId())));
        assertEquals(List.of(4L), service.radio("ouvinte", "source-1", 30, java.util.Set.of("source-2")).stream().map(Song::getId).toList());
    }

    @Test void likingDoesNotDeleteTodaysMix() {
        var users = mock(UserRepository.class); var songs = mock(SongRepository.class);
        var preferences = mock(PlaybackPreferenceRepository.class); var mixes = mock(DailyMixRepository.class);
        var user = new User(); user.setId(7L); var song = new Song(); song.setId(1L);
        when(users.findByUsernameForUpdate("ouvinte")).thenReturn(Optional.of(user));
        when(songs.findById(1L)).thenReturn(Optional.of(song));
        when(preferences.findByUserIdAndSongId(7L, 1L)).thenReturn(Optional.empty());
        var service = new RecommendationService(users, songs, mock(PlaylistRepository.class), preferences, mixes,
                mock(AccountPlaybackRepository.class), mock(MusicService.class));
        service.setFeedback("ouvinte", new RecommendationFeedbackRequest(1L, null, "LIKE"));
        verify(mixes, never()).delete(any());
        verify(preferences).save(any());
    }

    @Test
    void createsAndReusesDailyMixWithAtMostOneHundredSongs() {
        UserRepository users = mock(UserRepository.class);
        SongRepository songs = mock(SongRepository.class);
        PlaylistRepository playlists = mock(PlaylistRepository.class);
        PlaybackPreferenceRepository preferences = mock(PlaybackPreferenceRepository.class);
        DailyMixRepository dailyMixes = mock(DailyMixRepository.class);
        AccountPlaybackRepository accountPlayback = mock(AccountPlaybackRepository.class);
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
        when(users.findByUsernameForUpdate("ouvinte")).thenReturn(Optional.of(user));
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
                users, songs, playlists, preferences, dailyMixes, accountPlayback, music
        );
        var response = service.getDailyMix("ouvinte");

        assertEquals(100, response.songs().size());
        assertEquals(LocalDate.now(), response.generatedFor());
        assertNotNull(response.name());
    }
}
