package me.samulsz.musicapi.services;

import me.samulsz.musicapi.models.*;
import org.junit.jupiter.api.Test;
import java.time.LocalDateTime;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class RecommendationRankingTests {
    private PlaybackPreference preference(LocalDateTime at) {
        var result = new PlaybackPreference(); result.setLastListenedAt(at);
        result.setPlayCount(8); result.setCompletedCount(5); result.setListenedSeconds(1200);
        return result;
    }
    private Song song(long id, String artist, String genre) {
        var result = new Song(); result.setId(id); result.setArtist(artist); result.setGenres(Set.of(genre)); return result;
    }
    @Test void quickSkipsWeakenAffinityWithoutPermanentlyBanningGenres() {
        var now = LocalDateTime.now(); var engaged = preference(now); var skipped = preference(now);
        skipped.setSkippedCount(8); skipped.setCompletedCount(0); skipped.setListenedSeconds(40);
        assertTrue(RecommendationRanking.strength(engaged, now) > RecommendationRanking.strength(skipped, now));
        assertTrue(RecommendationRanking.strength(skipped, now) >= -8);
    }
    @Test void recentListeningHasMoreWeightButExplicitLikesPersist() {
        var now = LocalDateTime.now(); var recent = preference(now); var old = preference(now.minusDays(180));
        assertTrue(RecommendationRanking.strength(recent, now) > RecommendationRanking.strength(old, now));
        old.setLiked(true); assertTrue(RecommendationRanking.strength(old, now) >= 22);
    }
    @Test void radioPrioritizesCurrentArtistAndGenreNotWordsInTitle() {
        var anchor = song(1, "Alee", "Trap"); var related = song(2, "Alee, Convidado", "trap");
        var unrelated = song(3, "Outro", "Pagode"); unrelated.setTitle("Trap de mentira");
        assertTrue(RecommendationRanking.context(anchor, related) > RecommendationRanking.context(anchor, unrelated));
        assertEquals(0, RecommendationRanking.context(anchor, unrelated));
    }
    @Test void artistDiversityGroupsGuestCreditsAndKeepsEnoughTracks() {
        var ranked = List.of(song(1, "Alee", "trap"), song(2, "Alee, Outro", "trap"), song(3, "Yago", "rap"));
        var selected = RecommendationRanking.diversify(ranked, 2, 1);
        assertEquals(List.of(1L, 3L), selected.stream().map(Song::getId).toList());
        assertEquals(3, RecommendationRanking.diversify(ranked, 3, 1).size());
    }
}
