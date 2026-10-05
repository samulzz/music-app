package me.samulsz.musicapi.services;

import me.samulsz.musicapi.models.Song;
import java.text.Normalizer;
import java.util.*;

/** Conservative identity: never strip live/remix/acoustic/version credits. */
public final class CatalogIdentity {
    private CatalogIdentity() {}
    public static String normalize(String value) {
        return Normalizer.normalize(Objects.toString(value, ""), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
    }
    public static String title(String value) {
        return normalize(Objects.toString(value, "").replaceAll(
                "(?i)\\s*[\\[(]\\s*(?:official|oficial)\\s*(?:audio|video|music video|videoclipe)?\\s*[\\])]\\s*$", ""));
    }
    public static List<Song> unique(Collection<Song> songs) {
        return unique(songs, song -> true);
    }
    public static List<Song> unique(Collection<Song> songs, java.util.function.Predicate<Song> playable) {
        Map<String, Song> result = new LinkedHashMap<>();
        for (Song song : songs) {
            String title = title(song.getTitle()), artist = normalize(song.getArtist());
            String key = title.isBlank() || artist.isBlank() ? "id:" + song.getId() : title + "|" + artist;
            result.merge(key, song, (left, right) -> metadataScore(right) + (playable.test(right) ? 100 : 0)
                    > metadataScore(left) + (playable.test(left) ? 100 : 0) ? right : left);
        }
        return new ArrayList<>(result.values());
    }
    private static int metadataScore(Song song) {
        return (song.getAlbum() == null || song.getAlbum().isBlank() ? 0 : 4)
                + (song.getCoverUrl() == null || song.getCoverUrl().isBlank() ? 0 : 2)
                + Math.min(2, song.getGenres().size());
    }
}
