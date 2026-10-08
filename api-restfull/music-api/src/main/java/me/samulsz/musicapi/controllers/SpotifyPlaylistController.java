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
    private final me.samulsz.musicapi.services.UserSpotifyImportService imports;

    public SpotifyPlaylistController(SpotifyPlaylistService spotifyPlaylistService, me.samulsz.musicapi.services.UserSpotifyImportService imports) {
        this.spotifyPlaylistService = spotifyPlaylistService;
        this.imports = imports;
    }

    @PostMapping("/import")
    public ResponseEntity<?> importPlaylist(org.springframework.security.core.Authentication auth, @RequestBody SpotifyPlaylistRequest request) {
        try { return ResponseEntity.ok(imports.importPlaylist(auth.getName(), request.url())); }
        catch (IllegalArgumentException error) { return ResponseEntity.badRequest().body(Map.of("message", error.getMessage())); }
    }

    @PostMapping({"/import/preview", "/playlist/preview"})
    public ResponseEntity<?> preview(@RequestBody SpotifyPlaylistRequest request) {
        try {
            return ResponseEntity.ok(spotifyPlaylistService.preview(request.url()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }
}
