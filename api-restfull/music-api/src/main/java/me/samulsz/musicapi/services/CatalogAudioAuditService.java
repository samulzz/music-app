package me.samulsz.musicapi.services;

import me.samulsz.musicapi.models.AudioQualityReview;
import me.samulsz.musicapi.models.Song;
import me.samulsz.musicapi.repositories.AudioQualityReviewRepository;
import me.samulsz.musicapi.repositories.SongRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class CatalogAudioAuditService {
    private final SongRepository songs;
    private final AudioQualityReviewRepository reviews;
    private final MusicService music;
    private final AudioQualityAnalyzer analyzer;
    private final CatalogCurationStatusService status;
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).build();

    public CatalogAudioAuditService(SongRepository songs, AudioQualityReviewRepository reviews,
            MusicService music, AudioQualityAnalyzer analyzer, CatalogCurationStatusService status, ObjectMapper mapper) {
        this.songs = songs; this.reviews = reviews; this.music = music;
        this.analyzer = analyzer; this.status = status; this.mapper = mapper;
    }

    @Scheduled(initialDelay = 75_000, fixedDelay = 60_000)
    public synchronized void auditNextBatch() {
        var batch = songs.findAudioQualityCandidates(System.currentTimeMillis() - Duration.ofDays(7).toMillis());
        if (batch.isEmpty()) { status.audio("IDLE", "Catálogo revisado; aguardando novas músicas ou reanálise semanal.", 0, 0); return; }
        status.audio("RUNNING", "Analisando até 3 faixas, um processo FFmpeg por vez.", 0, 0);
        int checked = 0, warnings = 0;
        for (Song song : batch) {
            AudioQualityReview review = reviews.findById(song.getId()).orElseGet(AudioQualityReview::new);
            if (!Objects.equals(review.sourceId, song.getSourceId())) {
                review.sourceTitle = null; review.sourceChannel = null; review.sourceStatus = "NOT_CHECKED";
            }
            review.songId = song.getId(); review.sourceId = song.getSourceId();
            review.title = song.getTitle(); review.artist = song.getArtist();
            review.issue = "OK"; review.details = ""; review.confidence = 0;
            review.vocalAssessment = "NOT_ANALYZED";
            review.integratedLufs = null; review.truePeakDb = null; review.silenceRatio = null;
            review.durationSeconds = null; review.bitrate = null; review.bytes = 0; review.fileModified = 0;
            try {
                inspect(song, review);
            } catch (Exception error) {
                review.state = "ERROR"; review.issue = "ANALYSIS_FAILED";
                review.details = "Análise não concluída; o arquivo foi preservado. Reanálise disponível no painel.";
            }
            review.checkedAt = System.currentTimeMillis();
            reviews.save(review);
            checked++;
            if (!"OK".equals(review.issue)) warnings++;
        }
        status.audio("IDLE", checked + " faixas analisadas · " + warnings + " alerta(s). Resultados salvos no banco.", checked, warnings);
    }

    private void inspect(Song song, AudioQualityReview review) throws Exception {
        var audit = music.auditCachedAudio(song.getSourceId());
        review.bytes = audit.bytes(); review.durationSeconds = audit.durationSeconds(); review.bitrate = audit.bitrate();
        var file = music.audioFileForAnalysis(song.getSourceId());
        if (file == null && audit.playable()) {
            review.state = "UNSUPPORTED";
            review.details = "Fonte remota sem arquivo local: volume e presença de voz não analisados.";
            return;
        }
        List<AudioQualityRules.Finding> findings = new ArrayList<>();
        if (!"OK".equals(audit.issue())) findings.add(new AudioQualityRules.Finding(audit.issue(), 1, "Verificação técnica do arquivo: " + audit.issue()));
        if (file != null && file.isFile()) review.fileModified = file.lastModified();
        if (audit.durationSeconds() != null && audit.durationSeconds() > 0 && file != null) {
            var measured = analyzer.measure(file, audit.durationSeconds());
            review.integratedLufs = measured.integratedLufs(); review.truePeakDb = measured.truePeakDb();
            review.silenceRatio = measured.silenceRatio();
            if (song.getExpectedDurationMs() != null && song.getExpectedDurationMs() > 0) {
                double expected = song.getExpectedDurationMs() / 1000.0;
                if (Math.abs(expected - audit.durationSeconds()) > Math.max(20, expected * .15))
                    findings.add(new AudioQualityRules.Finding("DURATION_MISMATCH", .9, "Duração difere da referência; revisar versão."));
            }
        }
        resolveSource(review);
        findings.addAll(AudioQualityRules.evaluate(song.getTitle(), song.getAlbum(), review.sourceTitle,
                review.integratedLufs, review.truePeakDb, review.silenceRatio));
        if (findings.stream().anyMatch(f -> f.code().equals("POSSIBLE_INSTRUMENTAL")))
            review.vocalAssessment = "SOURCE_SUSPECTED_INSTRUMENTAL";
        review.issue = findings.isEmpty() ? "OK" : findings.stream().map(AudioQualityRules.Finding::code).distinct().collect(Collectors.joining(","));
        review.confidence = findings.stream().mapToDouble(AudioQualityRules.Finding::confidence).min().orElse(0);
        review.details = findings.stream().map(AudioQualityRules.Finding::evidence).collect(Collectors.joining(" "));
        review.state = review.integratedLufs != null && "RESOLVED".equals(review.sourceStatus) ? "COMPLETE" : "PARTIAL";
        // No deletion, automatic normalization or re-download based on a heuristic.
    }

    private void resolveSource(AudioQualityReview review) {
        if ("RESOLVED".equals(review.sourceStatus)) return;
        if (review.sourceId == null || !review.sourceId.matches("[A-Za-z0-9_-]{11}")) {
            review.sourceStatus = "UNSUPPORTED"; return;
        }
        try {
            var request = HttpRequest.newBuilder(URI.create("https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=" + review.sourceId))
                    .timeout(Duration.ofSeconds(6)).header("User-Agent", "NationMusics-AudioAudit/1.0").GET().build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200 || response.body().length() > 100_000) { review.sourceStatus = "UNAVAILABLE"; return; }
            var json = mapper.readTree(response.body());
            review.sourceTitle = json.path("title").asText("").substring(0, Math.min(1000, json.path("title").asText("").length()));
            review.sourceChannel = json.path("author_name").asText("").substring(0, Math.min(255, json.path("author_name").asText("").length()));
            review.sourceStatus = review.sourceTitle.isBlank() ? "UNAVAILABLE" : "RESOLVED";
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt(); review.sourceStatus = "UNAVAILABLE";
        } catch (Exception ignored) { review.sourceStatus = "UNAVAILABLE"; }
    }

    public void requestRecheck(long songId) {
        var song = songs.findById(songId).orElseThrow(() -> new IllegalArgumentException("Música não encontrada."));
        var review = reviews.findById(songId).orElseGet(AudioQualityReview::new);
        if (!Objects.equals(review.sourceId, song.getSourceId())) { review.sourceTitle = null; review.sourceChannel = null; }
        review.songId = songId; review.sourceId = song.getSourceId();
        review.title = song.getTitle(); review.artist = song.getArtist();
        review.checkedAt = 0; review.state = "PENDING"; review.sourceStatus = "NOT_CHECKED";
        reviews.save(review);
    }
}
