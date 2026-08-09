package me.samulsz.musicapi.services;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SpotifyPlaylistServiceTests {

    private final SpotifyPlaylistService service = new SpotifyPlaylistService(new ObjectMapper());

    @Test
    void acceptsPlaylistAlbumAndTrackLinks() {
        assertResource(
                "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=test",
                "playlist",
                "37i9dQZF1DXcBWIGoYBM5M"
        );
        assertResource(
                "https://open.spotify.com/intl-pt/album/4m2880jivSbbyEGAKfITCa",
                "album",
                "4m2880jivSbbyEGAKfITCa"
        );
        assertResource(
                "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
                "track",
                "4uLU6hMCjMI75M1A2tKUQC"
        );
    }

    @Test
    void rejectsUnsupportedSpotifyLinks() {
        assertThrows(
                IllegalArgumentException.class,
                () -> service.extractResource("https://open.spotify.com/artist/0OdUWJ0sBjDrqHygGUXeCF")
        );
    }

    private void assertResource(String url, String type, String id) {
        SpotifyPlaylistService.SpotifyResource resource = service.extractResource(url);
        assertEquals(type, resource.type());
        assertEquals(id, resource.id());
    }
}
