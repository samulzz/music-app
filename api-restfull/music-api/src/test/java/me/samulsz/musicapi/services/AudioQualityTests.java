package me.samulsz.musicapi.services;

import me.samulsz.musicapi.models.*;
import me.samulsz.musicapi.repositories.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.ObjectMapper;
import java.io.File;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class AudioQualityTests {
    @Test void catchesAllThreeReportedWrongSourceTypesWithoutPretendingToDetectVocals() {
        assertTrue(codes("Sumi", "Sumi", "[ FREE ] Alee x Lywie Sumi pra ficar [Prod.NC]").contains("POSSIBLE_INSTRUMENTAL"));
        assertTrue(codes("Beatriz", "Beatriz", "2ZDinizz Beatriz Ao Vivo Alma Festival").contains("POSSIBLE_LIVE_VERSION"));
        assertTrue(codes("Invisível pt.2", "Album", "VEIGH Invisível Pt.2 (8D AUDIO)").contains("ALTERED_VERSION"));
    }
    @Test void respectsRequestedVersionsAndDoesNotFlagWordsInsideOtherWords() {
        assertEquals(List.of(),codes("Live Forever", "Live Forever", "Live Forever"));
        assertEquals(List.of(),codes("Beatriz - Ao Vivo", "Show", "Beatriz Ao Vivo"));
        assertEquals(List.of(),codes("Guitar instrumental", "Album", "Guitar instrumental"));
        assertEquals(List.of(),codes("Deixa Viver", "Album", "Deixa Viver Official Audio"));
    }
    @Test void volumeAndSilenceAreMeasuredButDoNotClaimInstrumentalOrClipping() {
        var findings=AudioQualityRules.evaluate("EXAGERADO","Album","Official Audio",-30.0,2.0,.25);
        assertEquals(Set.of("LOW_VOLUME","HIGH_TRUE_PEAK","EXCESSIVE_SILENCE"),new HashSet<>(findings.stream().map(AudioQualityRules.Finding::code).toList()));
        assertTrue(AudioQualityRules.evaluate("Song","Album","Official Audio",-14.0,-1.0,.02).isEmpty());
    }
    @Test void parserHandlesTrailingLogsAndAllSilentAudioWithoutInventingLufs() {
        var analyzer=new AudioQualityAnalyzer(new ObjectMapper());
        var measured=analyzer.parse("silence_duration: 20\n{\"input_i\":\"-28.2\",\"input_tp\":\"-7.0\"}\nTrailing FFmpeg log",100);
        assertEquals(-28.2,measured.integratedLufs()); assertEquals(.2,measured.silenceRatio());
        var silent=analyzer.parse("silence_duration: 100\n{\"input_i\":\"-inf\",\"input_tp\":\"-inf\"}",100);
        assertNull(silent.integratedLufs()); assertEquals(1.0,silent.silenceRatio());
        assertThrows(IllegalStateException.class,()->analyzer.parse("no metrics",100));
    }
    @Test void persistsWarningsWithoutDeletingAudioOrAssumingVoiceAbsence() throws Exception {
        var songs=mock(SongRepository.class);var reviews=mock(AudioQualityReviewRepository.class);
        var music=mock(MusicService.class);var analyzer=mock(AudioQualityAnalyzer.class);
        var song=new Song();song.setId(1L);song.setTitle("Sumi");song.setSourceId("abcdefghijk");
        var previous=new AudioQualityReview();previous.sourceId=song.getSourceId();previous.sourceStatus="RESOLVED";previous.sourceTitle="Sumi instrumental";
        when(songs.findAudioQualityCandidates(anyLong())).thenReturn(List.of(song));when(reviews.findById(1L)).thenReturn(Optional.of(previous));
        when(music.auditCachedAudio(song.getSourceId())).thenReturn(new MusicService.AudioAudit(song.getSourceId(),true,true,1000000L,130.0,128000L,"OK"));
        when(music.audioFileForAnalysis(song.getSourceId())).thenReturn(new File("audio.mp3"));
        when(analyzer.measure(any(),anyDouble())).thenReturn(new AudioQualityAnalyzer.Measurement(-30.0,-5.0,.01));
        var service=new CatalogAudioAuditService(songs,reviews,music,analyzer,new CatalogCurationStatusService(),new ObjectMapper());
        service.auditNextBatch();
        var saved=ArgumentCaptor.forClass(AudioQualityReview.class);verify(reviews).save(saved.capture());
        assertTrue(saved.getValue().issue.contains("LOW_VOLUME"));assertTrue(saved.getValue().issue.contains("POSSIBLE_INSTRUMENTAL"));
        assertEquals("SOURCE_SUSPECTED_INSTRUMENTAL",saved.getValue().vocalAssessment);
        assertTrue(saved.getValue().checkedAt>0); verify(music,never()).invalidateCachedAudio(any());
    }
    @Test void recheckClearsStaleSourceMetadataAndQueuesWithoutNetworkOrDeletion() {
        var songs=mock(SongRepository.class);var reviews=mock(AudioQualityReviewRepository.class);var music=mock(MusicService.class);
        var song=new Song();song.setId(1L);song.setSourceId("new-source");
        var previous=new AudioQualityReview();previous.sourceId="old-source";previous.sourceTitle="old show";
        when(songs.findById(1L)).thenReturn(Optional.of(song));when(reviews.findById(1L)).thenReturn(Optional.of(previous));
        new CatalogAudioAuditService(songs,reviews,music,mock(AudioQualityAnalyzer.class),new CatalogCurationStatusService(),new ObjectMapper()).requestRecheck(1L);
        assertNull(previous.sourceTitle);assertEquals("PENDING",previous.state);assertEquals(0,previous.checkedAt);verifyNoInteractions(music);
    }
    private List<String> codes(String title,String album,String source) {
        return AudioQualityRules.evaluate(title,album,source,-14.0,-1.0,.01).stream().map(AudioQualityRules.Finding::code).toList();
    }
}
