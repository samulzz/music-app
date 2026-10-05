package me.samulsz.musicapi.services;

import me.samulsz.musicapi.models.Song;
import me.samulsz.musicapi.repositories.SongRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.Duration;
import java.util.Locale;

@Service
public class AlbumMetadataEnrichmentService {
    private final SongRepository songs;
    private final ObjectMapper mapper;
    private final HttpClient http;

    public AlbumMetadataEnrichmentService(SongRepository songs, ObjectMapper mapper) {
        this.songs = songs;
        this.mapper = mapper;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void resetMissingAlbumChecksAfterRestart() {
        songs.resetMissingAlbumMetadataChecks();
    }

    @Scheduled(initialDelay = 8_000, fixedDelay = 30_000)
    public void enrichBatch() {
        int enriched = 0;
        for (Song song : songs.findAlbumMetadataCandidates()) {
            try {
                if (enrich(song)) enriched++;
            } catch (Exception ignored) {
                // Uma falha temporária fica para a próxima rodada, sem afetar streaming ou busca.
                continue;
            }
            song.setAlbumMetadataChecked(true);
            songs.save(song);
            try { Thread.sleep(180); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); return; }
        }
        if (enriched > 0) System.out.println("Álbuns enriquecidos nesta rodada: " + enriched);
    }

    private boolean enrich(Song song) throws Exception {
        String query = cleanQuery(song.getTitle()) + " " + cleanQuery(primaryArtist(song.getArtist()));
        URI uri = URI.create("https://api.deezer.com/search?q=" + URLEncoder.encode(query, StandardCharsets.UTF_8) + "&limit=5");
        HttpRequest request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(12))
                .header("User-Agent", "NationMusics/1.0").GET().build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() < 200 || response.statusCode() >= 300) return false;
        JsonNode data = mapper.readTree(response.body()).path("data");
        if (!data.isArray()) return false;
        String expectedTitle = comparableTitle(song.getTitle());
        String expectedArtist = normalize(primaryArtist(song.getArtist()));
        for (JsonNode item : data) {
            String candidateTitle = comparableTitle(item.path("title").asText(""));
            String candidateArtist = normalize(item.path("artist").path("name").asText(""));
            if (expectedTitle.isBlank() || !expectedTitle.equals(candidateTitle) || expectedArtist.isBlank() || !expectedArtist.equals(candidateArtist)) continue;
            JsonNode album = item.path("album");
            String albumName = album.path("title").asText("").trim();
            if (albumName.isBlank()) continue;
            song.setAlbum(albumName);
            if (item.path("duration").asInt(0) > 0) song.setExpectedDurationMs(item.path("duration").asInt() * 1000);
            song.setAlbumArtist(item.path("artist").path("name").asText(primaryArtist(song.getArtist())).trim());
            String cover = album.path("cover_xl").asText(album.path("cover_big").asText(""));
            if (!cover.isBlank()) song.setCoverUrl(cover);
            return true;
        }
        return false;
    }

    private boolean sameEnough(String expected, String candidate) {
        if (expected.isBlank() || candidate.isBlank()) return false;
        return expected.equals(candidate) || expected.contains(candidate) || candidate.contains(expected);
    }

    private String comparableTitle(String value) {
        return CatalogIdentity.title(value);
    }

    private String primaryArtist(String value) {
        if (value == null) return "";
        return value.split("(?i)\\s*(?:,|feat\\.?|ft\\.?|&)\\s*")[0].trim();
    }

    private String cleanQuery(String value) { return value == null ? "" : value.replace("\"", "").trim(); }
    private String normalize(String value) {
        if (value == null) return "";
        return Normalizer.normalize(value, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
    }
}
