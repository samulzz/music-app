package me.samulsz.musicapi.services;

import me.samulsz.musicapi.models.Song;
import me.samulsz.musicapi.repositories.SongRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import tools.jackson.databind.*;

import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.Duration;
import java.util.*;

@Service
public class GenreMetadataEnrichmentService {
    private final SongRepository songs;
    private final CatalogCurationStatusService status;
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();

    public GenreMetadataEnrichmentService(SongRepository songs, CatalogCurationStatusService status, ObjectMapper mapper) {
        this.songs = songs; this.status = status; this.mapper = mapper;
    }

    @Scheduled(initialDelay = 45_000, fixedDelay = 60_000)
    public void classifySmallBatch() {
        List<Song> batch = songs.findGenreMetadataCandidates();
        if (batch.isEmpty()) { status.genres("IDLE", "Todas as músicas examinadas nesta passagem", 0, 0); return; }
        int changed = 0, processed = 0;
        status.genres("RUNNING", "Classificando lote leve de até " + batch.size() + " músicas", 0, 0);
        for (Song song : batch) {
            try {
                Set<String> found = classify(song);
                if (!found.isEmpty()) { Set<String> merged = new LinkedHashSet<>(song.getGenres()); merged.addAll(found); song.setGenres(merged); changed++; }
                song.setGenreMetadataChecked(true); songs.save(song); processed++;
                Thread.sleep(250);
            } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); break;
            } catch (Exception ignored) {
                song.setGenreMetadataChecked(true); songs.save(song); processed++;
            }
        }
        status.genres("IDLE", processed + " examinadas · " + changed + " classificadas", processed, changed);
    }

    private Set<String> classify(Song song) throws Exception {
        String q = Objects.toString(song.getTitle(), "") + " " + primaryArtist(song.getArtist());
        JsonNode results = get("https://api.deezer.com/search?q=" + URLEncoder.encode(q, StandardCharsets.UTF_8) + "&limit=4").path("data");
        if (!results.isArray()) return Set.of();
        String expectedTitle = comparable(song.getTitle()), expectedArtist = normalize(primaryArtist(song.getArtist()));
        for (JsonNode item : results) {
            if (!same(expectedTitle, comparable(item.path("title").asText(""))) || !same(expectedArtist, normalize(item.path("artist").path("name").asText("")))) continue;
            long albumId = item.path("album").path("id").asLong(0);
            if (albumId == 0) return Set.of();
            JsonNode album = get("https://api.deezer.com/album/" + albumId);
            Set<String> genres = new LinkedHashSet<>();
            JsonNode data = album.path("genres").path("data");
            if (data.isArray()) for (JsonNode genre : data) genres.addAll(mapGenre(genre.path("name").asText(""), song));
            return genres;
        }
        return Set.of();
    }

    private Set<String> mapGenre(String external, Song song) {
        // Só usa a taxonomia externa validada. Título contendo "rap" ou "funk"
        // não é evidência de gênero e foi justamente a origem dos falsos positivos antigos.
        String value = normalize(external);
        Set<String> result = new LinkedHashSet<>();
        if (value.matches(".*\\b(rap|hip hop)\\b.*")) result.add("rap");
        if (value.matches(".*\\btrap\\b.*")) result.add("trap");
        if (value.matches(".*\\bfunk\\b.*")) result.add("funk");
        if (value.matches(".*\\bsertanejo\\b.*")) result.add("sertanejo");
        if (value.matches(".*\\bpagode\\b.*")) result.add("pagode");
        if (value.matches(".*\\bsamba\\b.*")) result.add("samba");
        if (value.matches(".*\\bforro\\b.*")) result.add("forro");
        if (value.matches(".*\\bpiseiro\\b.*")) result.add("piseiro");
        if (value.matches(".*\\b(gospel|christian)\\b.*")) result.add("gospel");
        if (value.matches(".*\\bmpb\\b.*")) result.add("mpb");
        if (value.matches(".*\\bpop\\b.*")) result.add("pop");
        if (value.matches(".*\\brock\\b.*")) result.add("rock");
        return result;
    }
    private JsonNode get(String url) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(15)).header("User-Agent", "NationMusics/1.0").GET().build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() / 100 != 2) throw new IllegalStateException("Deezer HTTP " + response.statusCode());
        return mapper.readTree(response.body());
    }
    private boolean same(String left, String right) { return !left.isBlank() && !right.isBlank() && (left.equals(right) || left.contains(right) || right.contains(left)); }
    private String comparable(String value) { return normalize(value).replaceAll("\\b(?:ao vivo|live|official|oficial|audio|video|remix|remaster(?:ed)?)\\b", " ").replaceAll("\\s+", " ").trim(); }
    private String primaryArtist(String value) { return value == null ? "" : value.split("(?i)\\s*(?:,|feat\\.?|ft\\.?|&)\\s*")[0].trim(); }
    private String normalize(String value) { return value == null ? "" : Normalizer.normalize(value, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim(); }
}
