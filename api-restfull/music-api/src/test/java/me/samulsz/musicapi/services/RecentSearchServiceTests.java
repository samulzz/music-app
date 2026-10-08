package me.samulsz.musicapi.services;
import me.samulsz.musicapi.models.*;
import me.samulsz.musicapi.repositories.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.junit.jupiter.api.Assertions.*;

class RecentSearchServiceTests {
    @Test void openingSameSongUpdatesExistingAccountEntry() {
        var history=mock(RecentSearchSongRepository.class); var users=mock(UserRepository.class); var songs=mock(SongRepository.class);
        var user=new User(); var song=new Song(); song.setId(9L); var entry=new RecentSearchSong(); entry.id=3L;
        when(users.findByUsernameForUpdate("owner")).thenReturn(Optional.of(user));
        when(songs.findById(9L)).thenReturn(Optional.of(song));
        when(history.findByUserUsernameAndSongId("owner",9L)).thenReturn(Optional.of(entry));
        new RecentSearchService(history,users,songs).record("owner",9L);
        verify(history).save(entry); assertSame(user,entry.user); assertSame(song,entry.song); assertTrue(entry.searchedAt>0);
    }
    @Test void historyIsReadOnlyFromAuthenticatedAccount() {
        var history=mock(RecentSearchSongRepository.class); var users=mock(UserRepository.class); var songs=mock(SongRepository.class);
        var entry=new RecentSearchSong(); entry.song=new Song();
        when(history.findTop20ByUserUsernameOrderBySearchedAtDesc("owner")).thenReturn(List.of(entry));
        assertEquals(List.of(entry.song),new RecentSearchService(history,users,songs).list("owner"));
        verify(history).findTop20ByUserUsernameOrderBySearchedAtDesc("owner"); verifyNoInteractions(users,songs);
    }
}
