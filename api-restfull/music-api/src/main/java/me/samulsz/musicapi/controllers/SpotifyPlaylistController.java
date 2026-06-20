package me.samulsz.musicapi.controllers;

import me.samulsz.musicapi.dto.SpotifyPlaylistRequest;
import me.samulsz.musicapi.services.SpotifyPlaylistService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/spotify")
public class SpotifyPlaylistController {

    private final SpotifyPlaylistService spotifyPlaylistService;

    public SpotifyPlaylistController(SpotifyPlaylistService spotifyPlaylistService) {
        this.spotifyPlaylistService = spotifyPlaylistService;
    }

    @PostMapping("/playlist/preview")
    public ResponseEntity<?> preview(@RequestBody SpotifyPlaylistRequest request) {
        try {
            return ResponseEntity.ok(spotifyPlaylistService.preview(request.url()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }
}
