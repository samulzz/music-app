package me.samulsz.musicapi.services;

import me.samulsz.musicapi.dto.RecommendationFeedbackRequest;
import me.samulsz.musicapi.models.Song;
import me.samulsz.musicapi.models.User;
import me.samulsz.musicapi.repositories.SongRepository;
import me.samulsz.musicapi.repositories.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
class AccountCollectionsTests {
    @Autowired UserRepository users;
    @Autowired SongRepository songs;
    @Autowired SongService library;
    @Autowired RecommendationService recommendations;
    @Autowired RecentSearchService recentSearch;
    @Autowired me.samulsz.musicapi.repositories.PlaylistRepository playlists;

    @Test void lightweightPersonalSummariesArePrivateAndNeverContainEmbeddedSongs() {
        User owner=user("summary-owner"),other=user("summary-other");Song track=song();
        var playlist=new me.samulsz.musicapi.models.Playlist();playlist.setName("Private summary");playlist.setOwner(owner);playlist.setGlobalPlaylist(false);playlist.setSongs(java.util.Set.of(track));
        playlists.saveAndFlush(playlist);
        var summaries=playlists.findPersonalSummaries(owner.getUsername());
        assertEquals(1,summaries.size());assertEquals(1L,summaries.getFirst().getSongCount());
        assertTrue(playlists.findPersonalSummaries(other.getUsername()).isEmpty());
        var result=new PersonalPlaylistService(playlists,songs,users).listSummaries(owner.getUsername()).getFirst();
        assertEquals(1,result.songCount());assertFalse(result.globalPlaylist());
        var json=new tools.jackson.databind.ObjectMapper().valueToTree(result);
        assertFalse(json.has("songs"));assertFalse(json.has("owner"));
    }

    @Test void discoveryReadsMetadataWithoutSerializingPlaylistContentsOrPrivateCollections() {
        var track=song();
        var publicList=new me.samulsz.musicapi.models.Playlist();publicList.setName("Fast discovery fixture");publicList.setGlobalPlaylist(true);publicList.setSongs(java.util.Set.of(track));
        playlists.saveAndFlush(publicList);
        var privateList=new me.samulsz.musicapi.models.Playlist();privateList.setName("Private discovery fixture");privateList.setGlobalPlaylist(false);playlists.saveAndFlush(privateList);
        var summaries=playlists.findDiscoverySummaries();
        assertEquals(1L,summaries.stream().filter(p->p.getId().equals(publicList.getId())).findFirst().orElseThrow().getSongCount());
        assertTrue(summaries.stream().noneMatch(p->p.getId().equals(privateList.getId())));
        assertTrue(songs.findCatalogForDiscovery().stream().anyMatch(s->s.getId().equals(track.getId())));
    }

    private User user(String name) {
        User value = new User(); value.setUsername(name); value.setPassword("test-only");
        return users.saveAndFlush(value);
    }
    private Song song() {
        Song value = new Song(); value.setTitle("Collection test"); value.setArtist("Artist");
        value.setSourceId("collection-source"); value.setUri("test://collection");
        return songs.saveAndFlush(value);
    }
    @Test void downloadsJoinAccountLibraryWithoutDuplicatingOrChangingCatalogMetadata() {
        User owner = user("collection-owner"); User other = user("collection-other"); Song song = song();
        library.syncDownloads(owner.getUsername(), List.of(song.getSourceId(),song.getSourceId()));
        library.syncDownloads(owner.getUsername(), List.of(song.getSourceId()));
        assertEquals(1, library.getUserLibrary(owner.getUsername()).size());
        assertTrue(library.getUserLibrary(other.getUsername()).isEmpty());
        assertEquals("test://collection", songs.findById(song.getId()).orElseThrow().getUri());
    }
    @Test void likedCollectionIsPrivateAndAutomaticallyTracksHeartChanges() {
        User owner = user("likes-owner"); User other = user("likes-other"); Song song = song();
        recommendations.setFeedback(owner.getUsername(), new RecommendationFeedbackRequest(song.getId(),null,"LIKE"));
        assertEquals(List.of(song.getId()), recommendations.likedSongs(owner.getUsername()).stream().map(Song::getId).toList());
        assertTrue(recommendations.likedSongs(other.getUsername()).isEmpty());
        recommendations.setFeedback(owner.getUsername(), new RecommendationFeedbackRequest(song.getId(),null,"CLEAR"));
        assertTrue(recommendations.likedSongs(owner.getUsername()).isEmpty());
    }

    @Test void recentSearchHistoryContainsOnlySongsExplicitlyRecordedByThatUser() {
        User owner = user("search-owner"); User other = user("search-other"); Song song = song();
        recentSearch.record(owner.getUsername(), song.getId());
        recentSearch.record(owner.getUsername(), song.getId());
        assertEquals(List.of(song.getId()), recentSearch.list(owner.getUsername()).stream().map(Song::getId).toList());
        assertTrue(recentSearch.list(other.getUsername()).isEmpty());
        assertTrue(library.getUserLibrary(owner.getUsername()).isEmpty());
    }
}
