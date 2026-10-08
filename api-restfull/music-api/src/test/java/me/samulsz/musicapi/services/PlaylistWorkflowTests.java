package me.samulsz.musicapi.services;
import me.samulsz.musicapi.models.*;
import me.samulsz.musicapi.repositories.*;
import me.samulsz.musicapi.dto.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.junit.jupiter.api.Assertions.*;

class PlaylistWorkflowTests {
    @Test void addingCatalogSongDoesNotRequirePriorLibrarySave() {
        var playlists=mock(PlaylistRepository.class); var songs=mock(SongRepository.class); var users=mock(UserRepository.class);
        var user=new User(); user.setUsername("owner"); user.setDownloadedSongs(new HashSet<>());
        var playlist=new Playlist(); playlist.setOwner(user);
        var song=new Song(); song.setId(12L);
        when(playlists.findById(3L)).thenReturn(Optional.of(playlist)); when(users.findByUsername("owner")).thenReturn(Optional.of(user));
        when(songs.findById(12L)).thenReturn(Optional.of(song)); when(playlists.save(any())).thenAnswer(call -> call.getArgument(0));
        new PersonalPlaylistService(playlists,songs,users).addSongs("owner",3L,List.of(12L));
        assertTrue(playlist.getSongs().contains(song)); assertTrue(user.getDownloadedSongs().contains(song));
    }
    @Test void anotherAccountCannotEditPlaylist() {
        var playlists=mock(PlaylistRepository.class); var songs=mock(SongRepository.class); var users=mock(UserRepository.class);
        var user=new User(); user.setUsername("owner"); var playlist=new Playlist(); playlist.setOwner(user);
        when(playlists.findById(3L)).thenReturn(Optional.of(playlist));
        assertThrows(RuntimeException.class,()->new PersonalPlaylistService(playlists,songs,users).addSongs("other",3L,List.of(12L)));
        verify(playlists,never()).save(any());
    }
    @Test void spotifyImportUsesExistingAudioAndPrioritizesOnlyMissingTracks() {
        var spotify=mock(SpotifyPlaylistService.class); var playlists=mock(PlaylistRepository.class);
        var songs=mock(SongRepository.class); var users=mock(UserRepository.class); var priorities=mock(CatalogImportPriorityRepository.class); var music=mock(MusicService.class);
        var user=new User(); user.setUsername("owner"); when(users.findByUsernameForUpdate("owner")).thenReturn(Optional.of(user));
        when(playlists.findByOwnerUsernameOrderByIdDesc("owner")).thenReturn(List.of());
        var available=new Song(); available.setId(12L); available.setTitle("Canção"); available.setArtist("Artista"); available.setSourceId("audio");
        when(songs.findAllCatalogSongs()).thenReturn(List.of(available)); when(music.hasPrecachedAudio("audio")).thenReturn(true);
        when(spotify.preview("link")).thenReturn(new SpotifyPlaylistResponse("playlist","playlist","Nome","",2,false,List.of(new SpotifyPlaylistTrack("a","Cancao","Artista",1000),new SpotifyPlaylistTrack("b","Ausente","Artista",1000))));
        when(priorities.findByExternalTrackId(anyString())).thenReturn(Optional.empty()); when(playlists.save(any())).thenAnswer(call -> call.getArgument(0));
        var result=new UserSpotifyImportService(spotify,playlists,songs,users,priorities,music).importPlaylist("owner","link");
        assertEquals(Set.of(available),result.getSongs()); assertEquals(1,result.getPendingTracks().size()); assertEquals("b",result.getPendingTracks().get(0).spotifyId);
        verify(priorities,times(1)).save(argThat(item -> item.getPriority()==200 && item.getExternalTrackId().equals("spotify:track:b")));
    }
}
