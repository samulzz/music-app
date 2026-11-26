package me.samulsz.musicapi.services;

import me.samulsz.musicapi.models.Song;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class RadioContextTests {
    private Song song(long id, String title, String artist, String genre) {
        Song s = new Song(); s.setId(id); s.setTitle(title); s.setArtist(artist); s.setGenres(Set.of(genre)); return s;
    }
    @Test void genericPopCannotMixPortugueseSeedWithEnglishOrUnknownLanguage() {
        var seed = song(1, "Passado Presente", "Rô Rosa, Sotam", "pop");
        var en = song(2, "My Love", "International artist", "pop");
        var unknown = song(3, "XYZ", "Other", "pop");
        var pt = song(4, "Minha Vida", "Cantora", "pop");
        var collaborator = song(5, "Faixa", "Sotam", "rap");
        var ctx = new RadioContext(List.of(seed,en,unknown,pt,collaborator));
        assertEquals("pt", ctx.language(seed));
        assertFalse(ctx.compatible(seed,en,Set.of(2L))); // Even a mixed playlist cannot override language evidence.
        assertFalse(ctx.compatible(seed,unknown,Set.of()));
        assertTrue(ctx.compatible(seed,pt,Set.of()));
        assertTrue(ctx.compatible(seed,collaborator,Set.of()));
        assertTrue(RecommendationRanking.context(seed,collaborator) > 0);
        var child = song(6,"Minha Vida","Mundo Bita","infantil");child.setGenres(Set.of("pop","infantil"));
        assertFalse(ctx.compatible(seed,child,Set.of(6L)));
    }
    @Test void artistEvidenceHelpsSparseTitlesWithoutPretendingUnknownIsEnglish() {
        var a = song(1,"My Love","Singer","pop"); var b = song(2,"The Night","Singer","pop");
        var seed = song(3,"Superpowers","Singer","pop"); var br = song(4,"Minha Vida","Outro","pop");
        var ctx = new RadioContext(List.of(a,b,seed,br));
        assertEquals("en",ctx.language(seed)); assertFalse(ctx.compatible(seed,br,Set.of()));
        assertEquals("",ctx.language(song(5,"X","Unknown","pop")));
    }
    @Test void genericPopSeedUsesCollaboratorSceneInsteadOfMixingSertanejoAndChildrensSongs() {
        var seed=song(1,"Passado Presente","Rô Rosa, Sotam","pop");
        var a=song(2,"Minha Vida","Sotam","rap");var b=song(3,"Meu Coração","Sotam","rap");
        var unrelated=song(4,"Minha Saudade","Dupla Sertaneja","sertanejo");unrelated.setGenres(Set.of("pop","sertanejo"));
        var context=new RadioContext(List.of(seed,a,b,unrelated));
        assertEquals(Set.of("rap"),context.effectiveGenres(seed));
        assertFalse(context.compatible(seed,unrelated,Set.of(4L)));
        assertTrue(context.context(seed,a)>0);
    }
}
