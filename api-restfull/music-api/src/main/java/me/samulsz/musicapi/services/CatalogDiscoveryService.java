package me.samulsz.musicapi.services;

import me.samulsz.musicapi.dto.AlbumSummaryResponse;
import me.samulsz.musicapi.dto.SmartSearchResponse;
import me.samulsz.musicapi.dto.PlaylistSearchResult;
import me.samulsz.musicapi.models.Playlist;
import me.samulsz.musicapi.models.Song;
import me.samulsz.musicapi.repositories.PlaylistRepository;
import me.samulsz.musicapi.repositories.SongRepository;
import me.samulsz.musicapi.repositories.CatalogAlbumRepository;
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
    private static final List<SmartSearchResponse.GenreResult> GENRES = List.of(
            new SmartSearchResponse.GenreResult("Funk", "funk", "🔥", "#176b39", "green"),
            new SmartSearchResponse.GenreResult("Piseiro", "piseiro", "🪗", "#8a4b19", "orange"),
            new SmartSearchResponse.GenreResult("Sertanejo", "sertanejo", "🤠", "#70472b", "brown"),
            new SmartSearchResponse.GenreResult("Gospel", "gospel", "✨", "#265a80", "blue"),
            new SmartSearchResponse.GenreResult("Pagode", "pagode", "🥁", "#61447b", "purple"),
            new SmartSearchResponse.GenreResult("Trap", "trap", "💎", "#742e3c", "red"),
            new SmartSearchResponse.GenreResult("Forró", "forro", "🌵", "#7b651e", "yellow"),
            new SmartSearchResponse.GenreResult("Rap", "rap", "🎤", "#1f6663", "teal"),
            new SmartSearchResponse.GenreResult("Infantil", "infantil", "🧸", "#a34978", "purple")
    );
    private final SongRepository songs;
    private final PlaylistRepository playlists;
    private final MusicService music;
    private final CatalogAlbumRepository curatedAlbums;
    private volatile CatalogSnapshot cachedSnapshot;
    private record IndexedSong(Song song, String title, String artist, String album, String genres, String combined) {}
    private record CatalogSnapshot(long loadedAt, List<Song> songs, List<IndexedSong> index, List<PlaylistSearchResult> playlists, List<AlbumSummaryResponse> albums) {}

    private CatalogSnapshot snapshot() {
        var current = cachedSnapshot;
        if (current != null && System.currentTimeMillis() - current.loadedAt() < 30_000) return current;
        synchronized (this) {
            current = cachedSnapshot;
            if (current != null && System.currentTimeMillis() - current.loadedAt() < 30_000) return current;
            var catalog = songs.findCatalogForDiscovery();
            var summaries = playlists.findDiscoverySummaries().stream().map(p -> new PlaylistSearchResult(
                    p.getId(), p.getName(), p.getDescription(), p.getIconUrl(), true, p.getCollectionType(),
                    p.getSongCount().intValue(), p.getAlbumArtist(), p.getArtist())).toList();
            var index = catalog.stream().map(song -> {
                String title = normalize(song.getTitle()), artist = normalize(song.getArtist());
                String album = normalize(song.getAlbum()), genres = normalize(String.join(" ", song.getGenres()));
                return new IndexedSong(song, title, artist, album, genres, String.join(" ", title, artist, album, genres));
            }).toList();
            current = new CatalogSnapshot(System.currentTimeMillis(), catalog, index, summaries, buildAlbums(catalog, summaries));
            cachedSnapshot = current;
            return current;
        }
    }

    public CatalogDiscoveryService(SongRepository songs, PlaylistRepository playlists, MusicService music, CatalogAlbumRepository curatedAlbums) {
        this.songs = songs;
        this.playlists = playlists;
        this.music = music;
        this.curatedAlbums = curatedAlbums;
    }

    public SmartSearchResponse search(String rawQuery) {
        String normalizedQuery = normalize(rawQuery);
        String query = normalizedQuery.length() > 120 ? normalizedQuery.substring(0, 120) : normalizedQuery;
        if (query.isBlank()) return new SmartSearchResponse("", List.of(), List.of(), List.of(), List.of(), List.of());

        var catalog = snapshot();
        final String searchText = query;
        var tokens = searchText.split("\\s+");
        var literalCandidates = catalog.index().stream().filter(item -> Stream.of(tokens).allMatch(item.combined()::contains)).toList();
        boolean allowTypos = literalCandidates.isEmpty();
        List<ScoredSong> rankedSongs = (allowTypos ? catalog.index() : literalCandidates).stream()
                .map(item -> new ScoredSong(item.song(), songScore(item, searchText, allowTypos)))
                .filter(item -> item.score() > 0)
                .sorted(Comparator.comparingInt(ScoredSong::score).reversed()
                        .thenComparing(item -> normalize(item.song().getTitle())))
                .toList();

        List<Song> songResults = CatalogIdentity.unique(rankedSongs.stream()
                .map(ScoredSong::song)
                .filter(song -> music.hasPrecachedAudio(song.getSourceId()))
                .toList()).stream().limit(50).toList();

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

        List<PlaylistSearchResult> playlistResults = catalog.playlists().stream()
                .filter(playlist -> !"album".equalsIgnoreCase(playlist.getCollectionType()))
                .map(playlist -> Map.entry(playlist, collectionScore(playlist, query)))
                .filter(entry -> entry.getValue() > 0)
                .sorted(Map.Entry.<PlaylistSearchResult, Integer>comparingByValue().reversed())
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

        List<SmartSearchResponse.GenreResult> genreResults = GENRES.stream()
                .filter(genre -> matches(normalize(genre.name()), query) || matches(normalize(genre.query()), query))
                .toList();
        String correction = songResults.isEmpty() && artistResults.isEmpty() && albumResults.isEmpty()
                && playlistResults.isEmpty() && genreResults.isEmpty() ? closestSuggestion(query) : "";
        return new SmartSearchResponse(correction, songResults, artistResults, albumResults, playlistResults, genreResults).ranked(query);
    }

    public List<AlbumSummaryResponse> listAlbums() {
        return snapshot().albums();
    }

    private List<AlbumSummaryResponse> buildAlbums(List<Song> catalog, List<PlaylistSearchResult> summaries) {
        Map<String, AlbumAccumulator> grouped = new LinkedHashMap<>();
        catalog.stream()
                .filter(song -> song.getAlbum() != null && !song.getAlbum().isBlank())
                .forEach(song -> {
                    String artist = firstNonBlank(song.getAlbumArtist(), primaryArtist(song.getArtist()));
                    String key = normalize(song.getAlbum()) + "|" + normalize(artist);
                    AlbumAccumulator album = grouped.computeIfAbsent(key,
                            ignored -> new AlbumAccumulator(song.getAlbum().trim(), artist, song.getCoverUrl(), null));
                    album.songCount++;
                    if ((album.coverUrl == null || album.coverUrl.isBlank()) && song.getCoverUrl() != null) album.coverUrl = song.getCoverUrl();
                });
        summaries.stream()
                .filter(playlist -> "album".equalsIgnoreCase(playlist.getCollectionType()))
                .forEach(playlist -> {
                    String artist = firstNonBlank(playlist.albumArtist(), primaryArtist(playlist.artist()));
                    String key = normalize(playlist.getName()) + "|" + normalize(artist);
                    AlbumAccumulator album = grouped.computeIfAbsent(key,
                            ignored -> new AlbumAccumulator(playlist.getName(), artist, playlist.getIconUrl(), playlist.getId()));
                    album.playlistId = playlist.getId();
                    album.songCount = Math.max(album.songCount, playlist.songCount());
                    if (album.coverUrl == null || album.coverUrl.isBlank()) album.coverUrl = playlist.getIconUrl();
                });
        curatedAlbums.findByAvailableTrackCountGreaterThanEqualOrderByUpdatedAtDesc(2).forEach(curated -> {
            String key = normalize(curated.getName()) + "|" + normalize(curated.getArtist());
            AlbumAccumulator album = grouped.computeIfAbsent(key,
                    ignored -> new AlbumAccumulator(curated.getName(), curated.getArtist(), curated.getCoverUrl(), null));
            album.songCount = Math.max(album.songCount, curated.getAvailableTrackCount());
            album.expectedSongCount = curated.getExpectedTrackCount();
            if (album.coverUrl == null || album.coverUrl.isBlank()) album.coverUrl = curated.getCoverUrl();
        });
        return grouped.values().stream()
                .filter(album -> album.songCount >= 2)
                .sorted(Comparator.comparing((AlbumAccumulator value) -> normalize(value.artist))
                        .thenComparing(value -> normalize(value.name)))
                .map(album -> new AlbumSummaryResponse(album.name, album.artist, album.coverUrl, album.songCount, album.playlistId, album.expectedSongCount))
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
        return CatalogIdentity.unique(stream.filter(song -> music.hasPrecachedAudio(song.getSourceId()))
                .sorted(Comparator.comparing(song -> normalize(song.getTitle())))
                .toList());
    }

    private int songScore(IndexedSong item, String query, boolean allowTypos) {
        String title = item.title(), artist = item.artist(), album = item.album(), genres = item.genres();
        // A track title prefix must not be buried under songs whose artist/album
        // happens to contain the same text. Artists have their own unified hit.
        int score = Math.max(fieldScore(title, query, 120, allowTypos), fieldScore(artist, query, 95, allowTypos) / 2);
        score = Math.max(score, fieldScore(album, query, 80, allowTypos) / 3);
        score = Math.max(score, fieldScore(genres, query, 65, allowTypos) / 4);
        String combined = String.join(" ", title, artist, album, genres).trim();
        String[] tokens = query.split("\\s+");
        int matched = 0;
        for (String token : tokens) if (combined.contains(token) || (allowTypos && closestWordDistance(combined, token) <= typoTolerance(token))) matched++;
        if (matched == tokens.length) score = Math.max(score, 55 + matched * 4);
        return score;
    }

    private int collectionScore(PlaylistSearchResult playlist, String query) {
        return Math.max(fieldScore(normalize(playlist.getName()), query, 90),
                fieldScore(normalize(playlist.getDescription()), query, 55));
    }

    private int albumScore(AlbumSummaryResponse album, String query) {
        return Math.max(fieldScore(normalize(album.name()), query, 95), fieldScore(normalize(album.artist()), query, 80));
    }

    private int fieldScore(String field, String query, int base) {
        return fieldScore(field, query, base, true);
    }

    private int fieldScore(String field, String query, int base, boolean allowTypos) {
        if (field.isBlank()) return 0;
        int literal = field.equals(query) ? 500 : field.startsWith(query) ? 400
                : field.contains(" " + query) ? 350 : field.contains(query) ? 300 : 0;
        if (literal > 0) return literal + base;
        if (!allowTypos) return 0;
        if (typoTolerance(query) == 0 || Math.abs(field.length() - query.length()) > typoTolerance(query)) return 0;
        int distance = levenshtein(field, query);
        if (distance <= typoTolerance(query)) return base - distance * 8;
        return 0;
    }

    private boolean matches(String field, String query) {
        return field.contains(query) || query.contains(field) || (Math.abs(field.length() - query.length()) <= typoTolerance(query) && levenshtein(field, query) <= typoTolerance(query));
    }

    private String closestSuggestion(String query) {
        return snapshot().songs().stream()
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
        for (String word : text.split("\\s+")) if (Math.abs(word.length() - token.length()) <= typoTolerance(token)) best = Math.min(best, levenshtein(word, token));
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
        private final String name; private final String artist; private String coverUrl; private int songCount; private Long playlistId; private Integer expectedSongCount;
        private AlbumAccumulator(String name, String artist, String coverUrl, Long playlistId) {
            this.name = name; this.artist = artist; this.coverUrl = coverUrl; this.playlistId = playlistId;
        }
    }
}
