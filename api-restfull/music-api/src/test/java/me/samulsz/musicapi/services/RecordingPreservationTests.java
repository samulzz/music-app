package me.samulsz.musicapi.services;
import me.samulsz.musicapi.dto.SongRequest;
import me.samulsz.musicapi.models.Song;
import me.samulsz.musicapi.repositories.*;
import org.junit.jupiter.api.Test;
import java.util.Optional;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;
import static org.junit.jupiter.api.Assertions.*;
class RecordingPreservationTests {
    @Test void oldImporterCannotUndoCuratedRecordingUnlessExplicitlyRequested() {
        var songs=mock(SongRepository.class);var song=new Song();song.setId(1L);song.setTitle("Sumi");song.setArtist("Artist");song.setSourceId("fixed");song.setUri("fixed-uri");
        when(songs.findBySourceId("old")).thenReturn(Optional.empty());
        when(songs.findFirstByTitleIgnoreCaseAndArtistIgnoreCase("Sumi","Artist")).thenReturn(Optional.of(song));
        when(songs.save(any())).thenAnswer(i->i.getArgument(0));
        var request=new SongRequest();request.setTitle("Sumi");request.setArtist("Artist");request.setSourceId("old");request.setUri("old-uri");
        var service=new PlaylistAdminService(mock(PlaylistRepository.class),songs);
        assertEquals("fixed",service.importSong(request).getSourceId());assertEquals("fixed-uri",song.getUri());
        request.setReplaceRecording(true);assertEquals("old",service.importSong(request).getSourceId());assertEquals("old-uri",song.getUri());
    }
}
