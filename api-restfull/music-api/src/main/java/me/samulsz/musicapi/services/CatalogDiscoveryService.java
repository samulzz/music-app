package me.samulsz.musicapi.services;

import me.samulsz.musicapi.dto.AlbumSummaryResponse;
import me.samulsz.musicapi.dto.SmartSearchResponse;
import me.samulsz.musicapi.models.Playlist;
import me.samulsz.musicapi.models.Song;
import me.samulsz.musicapi.repositories.PlaylistRepository;
import me.samulsz.musicapi.repositories.SongRepository;
import org.springframework.stereotype.Service;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Stream;

@Service
public class CatalogDiscoveryService {
    private final SongRepository songs;
    private final PlaylistRepository playlists;
    private final MusicService music;

    public CatalogDiscoveryService(SongRepository songs, PlaylistRepository playlists, MusicService music) {
        this.songs = songs;
        this.playlists = playlists;
        this.music = music;
    }

    public SmartSearchResponse search(String rawQuery) {
        String query = normalize(rawQuery);
        if (query.isBlank()) return new SmartSearchResponse("", List.of(), List.of(), List.of(), List.of());

        List<ScoredSong> rankedSongs = songs.findAllCatalogSongs().stream()
                .map(song -> new ScoredSong(song, songScore(song, query)))
                .filter(item -> item.score() > 0)
                .sorted(Comparator.comparingInt(ScoredSong::score).reversed()
                        .thenComparing(item -> normalize(item.song().getTitle())))
                .toList();

        List<Song> songResults = rankedSongs.stream()
                .map(ScoredSong::song)
                .filter(song -> music.hasPrecachedAudio(song.getSourceId()))
                .limit(50)
                .toList();

        Map<String, ArtistAccumulator> artistMap = new LinkedHashMap<>();
        rankedSongs.stream().limit(250).forEach(item -> splitArtists(item.song().getArtist()).forEach(name -> {
            String normalized = normalize(name);
            if (!matches(normalized, query)) return;
            artistMap.computeIfAbsent(normalized, ignored -> new ArtistAccumulator(name, item.song().getCoverUrl())).count++;
        }));
        List<SmartSearchResponse.ArtistResult> artistResults = artistMap.values().stream()
                .sorted(Comparator.comparingInt(ArtistAccumulator::count).reversed())
                .limit(12)
                .map(value -> new SmartSearchResponse.ArtistResult(value.name, value.coverUrl, value.count))
                .toList();

        List<Playlist> allPlaylists = playlists.findByGlobalPlaylistTrueOrderByIdDesc();
        List<Playlist> playlistResults = allPlaylists.stream()
                .filter(playlist -> !"album".equalsIgnoreCase(playlist.getCollectionType()))
                .map(playlist -> Map.entry(playlist, collectionScore(playlist, query)))
                .filter(entry -> entry.getValue() > 0)
                .sorted(Map.Entry.<Playlist, Integer>comparingByValue().reversed())
                .limit(12)
                .map(Map.Entry::getKey)
                .toList();

        List<AlbumSummaryResponse> albumResults = listAlbums().stream()
                .map(album -> Map.entry(album, albumScore(album, query)))
                .filter(entry -> entry.getValue() > 0)
                .sorted(Map.Entry.<AlbumSummaryResponse, Integer>comparingByValue().reversed())
                .limit(12)
                .map(Map.Entry::getKey)
                .toList();

        String correction = songResults.isEmpty() && artistResults.isEmpty() && albumResults.isEmpty() && playlistResults.isEmpty()
                ? closestSuggestion(query) : "";
        return new SmartSearchResponse(correction, songResults, artistResults, albumResults, playlistResults);
    }

    public List<AlbumSummaryResponse> listAlbums() {
        Map<String, AlbumAccumulator> grouped = new LinkedHashMap<>();
        songs.findAllCatalogSongs().stream()
                .filter(song -> song.getAlbum() != null && !song.getAlbum().isBlank())
                .forEach(song -> {
                    String artist = firstNonBlank(song.getAlbumArtist(), primaryArtist(song.getArtist()));
                    String key = normalize(song.getAlbum()) + "|" + normalize(artist);
                    AlbumAccumulator album = grouped.computeIfAbsent(key,
                            ignored -> new AlbumAccumulator(song.getAlbum().trim(), artist, song.getCoverUrl(), null));
                    album.songCount++;
                    if ((album.coverUrl == null || album.coverUrl.isBlank()) && song.getCoverUrl() != null) album.coverUrl = song.getCoverUrl();
                });
        playlists.findByGlobalPlaylistTrueOrderByIdDesc().stream()
                .filter(playlist -> "album".equalsIgnoreCase(playlist.getCollectionType()))
                .forEach(playlist -> {
                    String artist = playlist.getSongs().stream().map(Song::getAlbumArtist).filter(Objects::nonNull)
                            .filter(value -> !value.isBlank()).findFirst().orElseGet(() -> playlist.getSongs().stream()
                                    .map(Song::getArtist).filter(Objects::nonNull).map(this::primaryArtist).findFirst().orElse(""));
                    String key = normalize(playlist.getName()) + "|" + normalize(artist);
                    AlbumAccumulator album = grouped.computeIfAbsent(key,
                            ignored -> new AlbumAccumulator(playlist.getName(), artist, playlist.getIconUrl(), playlist.getId()));
                    album.playlistId = playlist.getId();
                    album.songCount = Math.max(album.songCount, playlist.getSongs().size());
                    if (album.coverUrl == null || album.coverUrl.isBlank()) album.coverUrl = playlist.getIconUrl();
                });
        return grouped.values().stream()
                .filter(album -> album.songCount > 0)
                .sorted(Comparator.comparing((AlbumAccumulator value) -> normalize(value.artist))
                        .thenComparing(value -> normalize(value.name)))
                .map(album -> new AlbumSummaryResponse(album.name, album.artist, album.coverUrl, album.songCount, album.playlistId))
                .toList();
    }

    public List<Song> albumSongs(String name, String artist, Long playlistId) {
        Stream<Song> stream;
        if (playlistId != null) {
            Playlist playlist = playlists.findById(playlistId).orElseThrow(() -> new IllegalArgumentException("Álbum não encontrado."));
            if (!"album".equalsIgnoreCase(playlist.getCollectionType())) throw new IllegalArgumentException("Coleção não é um álbum.");
            stream = playlist.getSongs().stream();
        } else {
            stream = songs.findCatalogSongsByAlbum(Objects.toString(name, "").trim(), Objects.toString(artist, "").trim()).stream();
        }
        return stream.filter(song -> music.hasPrecachedAudio(song.getSourceId()))
                .sorted(Comparator.comparing(song -> normalize(song.getTitle())))
                .toList();
    }

    private int songScore(Song song, String query) {
        String title = normalize(song.getTitle());
        String artist = normalize(song.getArtist());
        String album = normalize(song.getAlbum());
        String genres = normalize(String.join(" ", song.getGenres()));
        int score = Math.max(fieldScore(title, query, 120), fieldScore(artist, query, 95));
        score = Math.max(score, fieldScore(album, query, 80));
        score = Math.max(score, fieldScore(genres, query, 65));
        String combined = String.join(" ", title, artist, album, genres).trim();
        String[] tokens = query.split("\\s+");
        int matched = 0;
        for (String token : tokens) if (combined.contains(token) || closestWordDistance(combined, token) <= typoTolerance(token)) matched++;
        if (matched == tokens.length) score = Math.max(score, 55 + matched * 4);
        return score;
    }

    private int collectionScore(Playlist playlist, String query) {
        return Math.max(fieldScore(normalize(playlist.getName()), query, 90),
                fieldScore(normalize(playlist.getDescription()), query, 55));
    }

    private int albumScore(AlbumSummaryResponse album, String query) {
        return Math.max(fieldScore(normalize(album.name()), query, 95), fieldScore(normalize(album.artist()), query, 80));
    }

    private int fieldScore(String field, String query, int base) {
        if (field.isBlank()) return 0;
        if (field.equals(query)) return base + 30;
        if (field.startsWith(query)) return base + 20;
        if (field.contains(query)) return base + 10;
        int distance = levenshtein(field, query);
        if (distance <= typoTolerance(query)) return base - distance * 8;
        return 0;
    }

    private boolean matches(String field, String query) {
        return field.contains(query) || query.contains(field) || levenshtein(field, query) <= typoTolerance(query);
    }

    private String closestSuggestion(String query) {
        return songs.findAllCatalogSongs().stream()
                .flatMap(song -> Stream.of(normalize(song.getTitle()), normalize(primaryArtist(song.getArtist()))))
                .filter(value -> !value.isBlank())
                .map(value -> Map.entry(value, levenshtein(value, query)))
                .filter(entry -> entry.getValue() <= Math.max(2, typoTolerance(query) + 1))
                .min(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse("");
    }

    private int closestWordDistance(String text, String token) {
        int best = Integer.MAX_VALUE;
        for (String word : text.split("\\s+")) best = Math.min(best, levenshtein(word, token));
        return best;
    }

    private int typoTolerance(String value) { return value.length() >= 8 ? 2 : value.length() >= 5 ? 1 : 0; }

    private int levenshtein(String left, String right) {
        int[] previous = new int[right.length() + 1];
        for (int j = 0; j <= right.length(); j++) previous[j] = j;
        for (int i = 1; i <= left.length(); i++) {
            int[] current = new int[right.length() + 1];
            current[0] = i;
            for (int j = 1; j <= right.length(); j++) {
                current[j] = Math.min(Math.min(current[j - 1] + 1, previous[j] + 1),
                        previous[j - 1] + (left.charAt(i - 1) == right.charAt(j - 1) ? 0 : 1));
            }
            previous = current;
        }
        return previous[right.length()];
    }

    private String normalize(String value) {
        if (value == null) return "";
        return Normalizer.normalize(value, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
    }

    private List<String> splitArtists(String value) {
        if (value == null) return List.of();
        List<String> result = new ArrayList<>();
        for (String item : value.split("(?i)\\s*(?:,|feat\\.?|ft\\.?|&)\\s*")) if (!item.isBlank()) result.add(item.trim());
        return result;
    }

    private String primaryArtist(String value) { return splitArtists(value).stream().findFirst().orElse(""); }
    private String firstNonBlank(String first, String second) { return first != null && !first.isBlank() ? first.trim() : Objects.toString(second, "").trim(); }

    private record ScoredSong(Song song, int score) {}
    private static final class ArtistAccumulator {
        private final String name; private final String coverUrl; private int count;
        private ArtistAccumulator(String name, String coverUrl) { this.name = name; this.coverUrl = coverUrl; }
        private int count() { return count; }
    }
    private static final class AlbumAccumulator {
        private final String name; private final String artist; private String coverUrl; private int songCount; private Long playlistId;
        private AlbumAccumulator(String name, String artist, String coverUrl, Long playlistId) {
            this.name = name; this.artist = artist; this.coverUrl = coverUrl; this.playlistId = playlistId;
        }
    }
}
