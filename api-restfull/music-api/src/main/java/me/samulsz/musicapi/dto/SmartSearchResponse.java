package me.samulsz.musicapi.dto;

import me.samulsz.musicapi.models.Playlist;
import me.samulsz.musicapi.models.Song;

import java.util.List;

public record SmartSearchResponse(
        String correctedQuery,
        List<Song> songs,
        List<ArtistResult> artists,
        List<AlbumSummaryResponse> albums,
        List<Playlist> playlists
) {
    public record ArtistResult(String name, String artworkUrl, int songCount) {}
}
