package me.samulsz.musicapi.services;

import me.samulsz.musicapi.models.Song;

import java.text.Collator;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

public final class SongOrder {

    private SongOrder() {}

    public static List<Song> alphabetically(Collection<Song> songs) {
        Collator collator = Collator.getInstance(Locale.forLanguageTag("pt-BR"));
        collator.setStrength(Collator.PRIMARY);

        Comparator<Song> comparator = Comparator
                .comparing(Song::getTitle, Comparator.nullsLast(collator))
                .thenComparing(Song::getArtist, Comparator.nullsLast(collator))
                .thenComparing(Song::getId, Comparator.nullsLast(Long::compareTo));

        List<Song> ordered = new ArrayList<>(songs);
        ordered.sort(comparator);
        return ordered;
    }
}
