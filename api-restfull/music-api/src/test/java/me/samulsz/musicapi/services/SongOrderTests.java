package me.samulsz.musicapi.services;

import me.samulsz.musicapi.models.Song;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SongOrderTests {

    @Test
    void sortsByTitleThenArtistWithoutChangingInput() {
        Song zulu = song("Zulu", "B");
        Song aguaB = song("Água", "B");
        Song aguaA = song("agua", "A");
        List<Song> input = List.of(zulu, aguaB, aguaA);

        List<Song> ordered = SongOrder.alphabetically(input);

        assertEquals(List.of(aguaA, aguaB, zulu), ordered);
        assertEquals(List.of(zulu, aguaB, aguaA), input);
    }

    private Song song(String title, String artist) {
        Song song = new Song();
        song.setTitle(title);
        song.setArtist(artist);
        return song;
    }
}
