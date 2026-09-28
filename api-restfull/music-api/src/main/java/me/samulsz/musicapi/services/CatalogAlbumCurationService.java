package me.samulsz.musicapi.services;

import me.samulsz.musicapi.models.*;
import me.samulsz.musicapi.repositories.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import tools.jackson.databind.*;

import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class CatalogAlbumCurationService {
    private final SongRepository songs;
    private final PlaybackPreferenceRepository preferences;
    private final CatalogAlbumRepository albums;
    private final CatalogImportPriorityRepository priorities;
    private final CatalogCurationStatusService status;
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    private final AtomicInteger artistCursor = new AtomicInteger();
    private final Map<String, Integer> albumCursors = new HashMap<>();

    public CatalogAlbumCurationService(SongRepository songs, PlaybackPreferenceRepository preferences,
            CatalogAlbumRepository albums, CatalogImportPriorityRepository priorities,
            CatalogCurationStatusService status, ObjectMapper mapper) {
        this.songs = songs; this.preferences = preferences; this.albums = albums;
        this.priorities = priorities; this.status = status; this.mapper = mapper;
    }

    @Scheduled(initialDelay = 20_000, fixedDelay = 600_000)
    public synchronized void curateNextAlbum() {
        String artist = nextArtist();
        status.albums("RUNNING", "Consultando discografia de " + artist, 0, 0);
        try {
            JsonNode artistResult = get("https://api.deezer.com/search/artist?q=" + encode(artist) + "&limit=5").path("data");
            JsonNode best = bestArtist(artistResult, artist);
            if (best == null) { status.albums("IDLE", "Artista não encontrado: " + artist, 0, 0); return; }
            JsonNode releases = get("https://api.deezer.com/artist/" + best.path("id").asLong() + "/albums?limit=100").path("data");
            List<JsonNode> realAlbums = new ArrayList<>();
            if (releases.isArray()) for (JsonNode release : releases) {
                String type = release.path("record_type").asText("");
                // A listagem de álbuns do Deezer não envia nb_tracks de forma consistente;
                // a quantidade confiável vem no detalhe consultado logo abaixo.
                if ("album".equalsIgnoreCase(type) || "ep".equalsIgnoreCase(type)) realAlbums.add(release);
            }
            if (realAlbums.isEmpty()) { status.albums("IDLE", "Nenhum álbum completo encontrado para " + artist, 0, 0); return; }
            realAlbums.sort(Comparator.comparingInt(this::albumRank).reversed());
            int cursor = albumCursors.getOrDefault(normalize(artist), 0) % realAlbums.size();
            albumCursors.put(normalize(artist), cursor + 1);
            JsonNode album = get("https://api.deezer.com/album/" + realAlbums.get(cursor).path("id").asLong());
            curateAlbum(album);
        } catch (Exception error) {
            status.albums("ERROR", shortMessage(error), 0, 0);
        }
    }

    private void curateAlbum(JsonNode data) {
        String externalId = "deezer:album:" + data.path("id").asText();
        String name = data.path("title").asText("").trim();
        String artist = data.path("artist").path("name").asText("").trim();
        String cover = data.path("cover_xl").asText(data.path("cover_big").asText(""));
        JsonNode tracks = data.path("tracks").path("data");
        if (name.isBlank() || artist.isBlank() || !tracks.isArray()) return;

        CatalogAlbum album = albums.findByExternalId(externalId).orElseGet(CatalogAlbum::new);
        album.setExternalId(externalId); album.setName(name); album.setArtist(artist); album.setCoverUrl(cover);
        album.setExpectedTrackCount(tracks.size()); album.setUpdatedAt(System.currentTimeMillis());
        List<Song> catalog = songs.findAllCatalogSongs();
        int available = 0, queued = 0;
        for (JsonNode track : tracks) {
            String title = track.path("title").asText("").trim();
            String trackArtist = track.path("artist").path("name").asText(artist).trim();
            Optional<Song> existing = catalog.stream().filter(song -> songMatches(song, title, trackArtist)).findFirst();
            if (existing.isPresent()) {
                Song song = existing.get(); song.setAlbum(name); song.setAlbumArtist(artist);
                if (!cover.isBlank()) song.setCoverUrl(cover); song.setAlbumMetadataChecked(true); songs.save(song); available++;
            } else {
                String trackId = "deezer:track:" + track.path("id").asText();
                CatalogImportPriority priority = priorities.findByExternalTrackId(trackId).orElseGet(CatalogImportPriority::new);
                long now = System.currentTimeMillis();
                priority.setExternalTrackId(trackId); priority.setTitle(title); priority.setArtist(trackArtist);
                priority.setAlbum(name); priority.setAlbumArtist(artist); priority.setCoverUrl(cover);
                priority.setDurationMs(track.path("duration").asInt(0) * 1000);
                priority.setReason("Completar álbum de artista ouvido no app"); priority.setPriority(100);
                if (priority.getCreatedAt() == 0) priority.setCreatedAt(now);
                if (!"IMPORTED".equals(priority.getStatus())) priority.setStatus("PENDING");
                priority.setUpdatedAt(now); priorities.save(priority); queued++;
            }
        }
        album.setAvailableTrackCount(available); albums.save(album);
        status.albums("IDLE", name + " · " + available + "/" + tracks.size() + " disponíveis · " + queued + " priorizadas", tracks.size(), available);
    }

    private String nextArtist() {
        List<String> artists = new ArrayList<>(); artists.add("Alee"); artists.addAll(preferences.findMostListenedArtists());
        List<String> unique = artists.stream().map(this::primaryArtist).filter(value -> !value.isBlank()).distinct().toList();
        return unique.get(Math.floorMod(artistCursor.getAndIncrement(), unique.size()));
    }
    private int albumRank(JsonNode album) {
        String name = normalize(album.path("title").asText(""));
        return name.contains("para") && name.contains("fingi amar") ? 10_000 : album.path("fans").asInt(0);
    }
    private JsonNode bestArtist(JsonNode data, String artist) {
        if (!data.isArray()) return null;
        String expected = normalize(artist);
        JsonNode fallback = null, exact = null;
        for (JsonNode item : data) {
            if (fallback == null || item.path("nb_fan").asLong(0) > fallback.path("nb_fan").asLong(0)) fallback = item;
            if (normalize(item.path("name").asText("")).equals(expected)
                    && (exact == null || item.path("nb_fan").asLong(0) > exact.path("nb_fan").asLong(0))) exact = item;
        }
        return exact != null ? exact : fallback;
    }
    private boolean songMatches(Song song, String title, String artist) {
        String left = comparableTitle(song.getTitle()), right = comparableTitle(title);
        String songArtist = normalize(primaryArtist(song.getArtist())), expectedArtist = normalize(primaryArtist(artist));
        return (left.equals(right) || left.contains(right) || right.contains(left)) && (songArtist.equals(expectedArtist) || songArtist.contains(expectedArtist) || expectedArtist.contains(songArtist));
    }
    private JsonNode get(String url) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(15)).header("User-Agent", "NationMusics/1.0").GET().build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() / 100 != 2) throw new IllegalStateException("Deezer HTTP " + response.statusCode());
        return mapper.readTree(response.body());
    }
    private String primaryArtist(String value) { return value == null ? "" : value.split("(?i)\\s*(?:,|feat\\.?|ft\\.?|&)\\s*")[0].trim(); }
    private String comparableTitle(String value) { return normalize(value).replaceAll("\\b(?:ao vivo|live|official|oficial|audio|video|remaster(?:ed)?)\\b", " ").replaceAll("\\s+", " ").trim(); }
    private String normalize(String value) { return value == null ? "" : Normalizer.normalize(value, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim(); }
    private String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    private String shortMessage(Exception error) { String message = Objects.toString(error.getMessage(), error.getClass().getSimpleName()); return message.length() > 240 ? message.substring(0, 240) : message; }
}
