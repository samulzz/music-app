package me.samulsz.musicapi.dto;

import me.samulsz.musicapi.models.Playlist;
import me.samulsz.musicapi.models.Song;

import java.util.List;

public record SmartSearchResponse(
        String correctedQuery,
        List<Song> songs,
        List<ArtistResult> artists,
        List<AlbumSummaryResponse> albums,
        List<Playlist> playlists,
        List<GenreResult> genres,
        List<SearchResult> results
) {
    public SmartSearchResponse(String correction, List<Song> songs, List<ArtistResult> artists,
            List<AlbumSummaryResponse> albums, List<Playlist> playlists, List<GenreResult> genres) {
        this(correction, songs, artists, albums, playlists, genres, List.of());
    }
    /** One relevance order shared by both clients; old arrays remain compatible. */
    public SmartSearchResponse ranked(String query) {
        var hits = new java.util.ArrayList<SearchResult>();
        for (int i = 0; i < songs.size(); i++) hits.add(new SearchResult("song", i));
        for (int i = 0; i < artists.size(); i++) hits.add(new SearchResult("artist", i));
        for (int i = 0; i < albums.size(); i++) hits.add(new SearchResult("album", i));
        for (int i = 0; i < playlists.size(); i++) hits.add(new SearchResult("playlist", i));
        for (int i = 0; i < genres.size(); i++) hits.add(new SearchResult("genre", i));
        hits.sort(java.util.Comparator.comparingInt((SearchResult hit) -> {
            String name = switch (hit.type()) {
                case "song" -> songs.get(hit.index()).getTitle();
                case "artist" -> artists.get(hit.index()).name();
                case "album" -> albums.get(hit.index()).name();
                case "playlist" -> playlists.get(hit.index()).getName();
                default -> genres.get(hit.index()).name();
            };
            return relevance(name, query);
        }).reversed());
        return new SmartSearchResponse(correctedQuery, songs, artists, albums, playlists, genres, hits);
    }
    public static int relevance(String text, String query) {
        String name = me.samulsz.musicapi.services.CatalogIdentity.normalize(text);
        String q = me.samulsz.musicapi.services.CatalogIdentity.normalize(query);
        if (q.isBlank()) return 0;
        if (name.equals(q)) return 500;
        if (name.startsWith(q)) return 400;
        if (name.contains(" " + q)) return 350;
        if (name.contains(q)) return 300;
        return 0;
    }
    public record SearchResult(String type, int index) {}
    public record ArtistResult(String name, String artworkUrl, int songCount) {}
    public record GenreResult(String name, String query, String icon, String color, String tone) {}
}
