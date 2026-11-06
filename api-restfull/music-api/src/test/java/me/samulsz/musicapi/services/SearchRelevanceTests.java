package me.samulsz.musicapi.services;

import me.samulsz.musicapi.dto.*;
import me.samulsz.musicapi.models.Song;
import me.samulsz.musicapi.repositories.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;

class SearchRelevanceTests {
    @Test void partialTitleBeatsFuzzyArtistAndSearchRemainsAvailableBeforeFullTitle() {
        var songs = mock(SongRepository.class);
        var music = mock(MusicService.class);
        var target = new Song(); target.setId(1L); target.setSourceId("superpowers");
        target.setTitle("Superpowers"); target.setArtist("Daniel Caesar");
        var other = new Song(); other.setId(2L); other.setSourceId("other");
        other.setTitle("A different song"); other.setArtist("Super");
        when(songs.findAllCatalogSongs()).thenReturn(List.of(other, target));
        when(music.hasPrecachedAudio(any())).thenReturn(true);
        var service = new CatalogDiscoveryService(songs, mock(PlaylistRepository.class), music, mock(CatalogAlbumRepository.class));
        for (String query : List.of("sup", "super", "superp", "superpowers")) {
            assertEquals(1L, service.search(query).songs().getFirst().getId());
        }
        assertEquals(1, service.search("superp").songs().size());
    }
    @Test void exactArtistAndAlbumAreInterleavedWithTracksInsteadOfGroupedByType() {
        var song = new Song(); song.setTitle("Other title"); song.setArtist("Superpowers");
        var response = new SmartSearchResponse("", List.of(song),
                List.of(new SmartSearchResponse.ArtistResult("Superpowers", "", 1)),
                List.of(new AlbumSummaryResponse("Superpowers deluxe", "Artist", "", 3, null, 3)),
                List.of(), List.of()).ranked("superpowers");
        assertEquals(List.of("artist", "album", "song"), response.results().stream().map(SmartSearchResponse.SearchResult::type).toList());
        assertTrue(SmartSearchResponse.relevance("É amor", "e am") > 0);
    }
}
