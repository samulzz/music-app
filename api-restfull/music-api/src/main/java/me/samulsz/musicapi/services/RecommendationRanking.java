package me.samulsz.musicapi.services;

import me.samulsz.musicapi.models.PlaybackPreference;
import me.samulsz.musicapi.models.Song;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.text.Normalizer;
import java.util.*;

/** Bounded, explainable signals: a quick skip is not a permanent genre ban. */
final class RecommendationRanking {
    static double strength(PlaybackPreference preference, LocalDateTime now) {
        double plays = Math.max(1, preference.getPlayCount());
        double skipRatio = Math.min(1, preference.getSkippedCount() / plays);
        double engaged = Math.max(0, preference.getPlayCount() - preference.getSkippedCount());
        double positive = Math.log1p(engaged) * 3 + Math.log1p(preference.getCompletedCount()) * 6
                + Math.log1p(preference.getRepeatedCount()) * 5
                + Math.min(8, Math.log1p(preference.getListenedSeconds() / 60.0) * 2);
        long days = preference.getLastListenedAt() == null ? 90 : Math.max(0, ChronoUnit.DAYS.between(preference.getLastListenedAt(), now));
        double recency = 0.25 + 0.75 * Math.exp(-days / 45.0);
        if (preference.isDoNotRecommend()) return -12;
        return (positive * (1 - skipRatio * 0.75) - Math.min(8, preference.getSkippedCount() * 2)) * recency
                + (preference.isLiked() ? 22 : 0);
    }

    static String artist(Song song) {
        return key(Objects.toString(song.getArtist(), "").split("(?i)\\s*(?:,|\\bfeat\\.?|\\bft\\.?|&)\\s*")[0]);
    }

    static String key(String text) {
        return Normalizer.normalize(Objects.toString(text, ""), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).trim();
    }

    static double context(Song anchor, Song candidate) {
        if (anchor == null) return 0;
        double score = !artist(anchor).isBlank() && artist(anchor).equals(artist(candidate)) ? 55 : 0;
        var genres = new HashSet<>(anchor.getGenres().stream().map(RecommendationRanking::key).toList());
        return score + candidate.getGenres().stream().map(RecommendationRanking::key).filter(genres::contains).count() * 45;
    }

    static List<Song> diversify(List<Song> ranked, int limit, int artistLimit) {
        var result = new ArrayList<Song>();
        var counts = new HashMap<String, Integer>();
        var seen = new HashSet<Long>();
        for (Song song : ranked) {
            String artist = artist(song);
            if (counts.getOrDefault(artist, 0) >= artistLimit) continue;
            if (!seen.add(song.getId())) continue;
            result.add(song); counts.merge(artist, 1, Integer::sum);
            if (result.size() >= limit) return result;
        }
        for (Song song : ranked) {
            if (seen.add(song.getId())) result.add(song);
            if (result.size() >= limit) break;
        }
        return result;
    }
}
