package me.samulsz.musicapi.services;

import me.samulsz.musicapi.models.Song;
import java.util.*;

/** Conservative language evidence, not a lyric/language detector. Unknown stays unknown. */
final class RadioContext {
    private static final Set<String> BR = Set.of("sertanejo", "pagode", "samba", "forro", "piseiro", "mpb", "brega", "funk carioca", "funk brasileiro", "rap nacional");
    private static final Set<String> PT = Set.of("nao", "voce", "minha", "meu", "pra", "saudade", "coracao", "amor", "passado", "presente", "beijo", "garota", "ela", "sua", "nos", "deixa", "vida", "tudo");
    private static final Set<String> EN = Set.of("the", "you", "your", "love", "my", "me", "night", "heart", "with", "never", "baby", "girl", "she", "dont", "not", "want", "feel");
    private final Map<String, int[]> artists = new HashMap<>();
    private final Map<String, Map<String, Integer>> artistGenres = new HashMap<>();
    private static final Set<String> SCENES = Set.of("rap", "trap", "sertanejo", "pagode", "samba", "forro", "piseiro", "mpb", "funk", "rock", "infantil", "gospel", "phonk");

    RadioContext(List<Song> catalog) {
        for (Song song : catalog) {
            for (String artist : RecommendationRanking.artists(song)) {
                var counts = artistGenres.computeIfAbsent(artist, k -> new HashMap<>());
                song.getGenres().stream().map(RecommendationRanking::key).filter(SCENES::contains).forEach(g -> counts.merge(g, 1, Integer::sum));
            }
            String hint = titleLanguage(song);
            if (!hint.isEmpty()) {
                int[] counts = artists.computeIfAbsent(RecommendationRanking.artist(song), k -> new int[2]);
                counts[hint.equals("pt") ? 0 : 1]++;
            }
        }
    }

    Set<String> effectiveGenres(Song song) {
        var result = new HashSet<>(song.getGenres().stream().map(RecommendationRanking::key).toList());
        if (result.stream().noneMatch(SCENES::contains)) {
            var counts = new HashMap<String, Integer>();
            for (String artist : RecommendationRanking.artists(song)) artistGenres.getOrDefault(artist, Map.of()).forEach((g,n) -> counts.merge(g,n,Integer::sum));
            counts.entrySet().stream().filter(e -> e.getValue() >= 2).max(Map.Entry.comparingByValue()).ifPresent(e -> {
                result.remove("pop"); result.add(e.getKey());
            });
        }
        return result;
    }

    double context(Song anchor, Song candidate) {
        if (anchor == null) return 0;
        double sameArtist = RecommendationRanking.artists(anchor).stream().anyMatch(RecommendationRanking.artists(candidate)::contains) ? 55 : 0;
        var genres = effectiveGenres(anchor);
        return sameArtist + candidate.getGenres().stream().map(RecommendationRanking::key).filter(genres::contains).count() * 45;
    }

    private String titleLanguage(Song song) {
        if (song.getGenres().stream().map(RecommendationRanking::key).anyMatch(BR::contains)) return "pt";
        String title = RecommendationRanking.key(song.getTitle());
        Set<String> words = new HashSet<>(Arrays.asList(title.replaceAll("[^a-z ]", " ").split("\\s+")));
        long pt = words.stream().filter(PT::contains).count(), en = words.stream().filter(EN::contains).count();
        if (pt >= 2 && pt > en) return "pt";
        if (en >= 2 && en > pt) return "en";
        return "";
    }

    String language(Song song) {
        String direct = titleLanguage(song);
        if (!direct.isEmpty()) return direct;
        int[] counts = artists.get(RecommendationRanking.artist(song));
        if (counts != null && counts[0] >= 2 && counts[0] > counts[1] * 2) return "pt";
        if (counts != null && counts[1] >= 2 && counts[1] > counts[0] * 2) return "en";
        return "";
    }

    boolean compatible(Song anchor, Song candidate, Set<Long> peers) {
        if (anchor == null) return true;
        var seedGenres = new HashSet<>(anchor.getGenres().stream().map(RecommendationRanking::key).toList());
        if (candidate.getGenres().stream().map(RecommendationRanking::key)
                .filter(Set.of("infantil", "gospel", "anime", "rap de anime", "phonk")::contains)
                .anyMatch(g -> !seedGenres.contains(g))) return false;
        var scene = effectiveGenres(anchor);
        var candidateScenes = candidate.getGenres().stream().map(RecommendationRanking::key).filter(SCENES::contains).toList();
        boolean sameArtist = RecommendationRanking.artists(anchor).stream().anyMatch(RecommendationRanking.artists(candidate)::contains);
        if (!sameArtist && scene.stream().anyMatch(SCENES::contains) && !candidateScenes.isEmpty()
                && candidateScenes.stream().noneMatch(g -> scene.contains(g)
                || (Set.of("rap","trap").contains(g) && (scene.contains("rap") || scene.contains("trap"))))) return false;
        String a = language(anchor), b = language(candidate);
        if (!a.isEmpty() && !b.isEmpty() && !a.equals(b)) return false;
        if (a.isEmpty() || !b.isEmpty()) return true;
        // A generic pop/rap label alone is not evidence of language compatibility.
        return RecommendationRanking.artists(anchor).stream().anyMatch(RecommendationRanking.artists(candidate)::contains)
                || peers.contains(candidate.getId())
                || anchor.getGenres().stream().map(RecommendationRanking::key).filter(BR::contains)
                .anyMatch(g -> candidate.getGenres().stream().map(RecommendationRanking::key).anyMatch(g::equals));
    }
}
