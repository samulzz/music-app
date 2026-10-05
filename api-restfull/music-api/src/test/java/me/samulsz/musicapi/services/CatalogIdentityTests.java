package me.samulsz.musicapi.services;
import me.samulsz.musicapi.models.Song;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class CatalogIdentityTests {
    Song song(long id, String title, String artist) {
        Song song = new Song(); song.setId(id); song.setTitle(title); song.setArtist(artist); return song;
    }
    @Test void collapsesOnlySameTitleAndAllArtistCredits() {
        var studio = song(1,"Água", "Alee");
        var duplicate = song(2,"agua (Official Audio)", "ALEE"); duplicate.setAlbum("Álbum");
        var live = song(3,"Água - Ao Vivo", "Alee");
        var remix = song(4,"Água - Remix", "Alee");
        var other = song(5,"Água", "Outro");
        assertEquals(List.of(duplicate,live,remix,other), CatalogIdentity.unique(List.of(studio,duplicate,live,remix,other)));
    }
    @Test void prefersPlayableDuplicateOverRicherBrokenFile() {
        var good = song(1,"Faixa", "Artista");
        var broken = song(2,"Faixa", "Artista"); broken.setAlbum("Álbum");
        assertEquals(List.of(good), CatalogIdentity.unique(List.of(broken,good), song -> song.getId() == 1));
    }
    @Test void versionMarkersRemainInAlbumIdentity() {
        assertNotEquals(CatalogIdentity.title("Faixa"), CatalogIdentity.title("Faixa - Ao Vivo"));
        assertNotEquals(CatalogIdentity.title("Faixa"), CatalogIdentity.title("Faixa (Acústico)"));
    }
}
