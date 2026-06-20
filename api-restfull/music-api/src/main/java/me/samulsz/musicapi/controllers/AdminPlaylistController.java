package me.samulsz.musicapi.controllers;

import me.samulsz.musicapi.dto.PlaylistRequest;
import me.samulsz.musicapi.dto.PlaylistSongsRequest;
import me.samulsz.musicapi.dto.SongRequest;
import me.samulsz.musicapi.models.Playlist;
import me.samulsz.musicapi.models.Song;
import me.samulsz.musicapi.services.AdminSessionService;
import me.samulsz.musicapi.services.MusicService;
import me.samulsz.musicapi.services.PlaylistAdminService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminPlaylistController {

    private final AdminSessionService adminSessionService;
    private final PlaylistAdminService playlistAdminService;
    private final MusicService musicService;

    public AdminPlaylistController(AdminSessionService adminSessionService,
                                   PlaylistAdminService playlistAdminService,
                                   MusicService musicService) {
        this.adminSessionService = adminSessionService;
        this.playlistAdminService = playlistAdminService;
        this.musicService = musicService;
    }

    @GetMapping("/playlists")
    public ResponseEntity<?> listPlaylists(@RequestHeader(value = "X-ADMIN-TOKEN", required = false) String adminToken) {
        if (!isAuthorized(adminToken)) return unauthorized();
        return ResponseEntity.ok(playlistAdminService.listAllPlaylists());
    }

    @GetMapping("/playlists/{id}")
    public ResponseEntity<?> getPlaylist(@RequestHeader(value = "X-ADMIN-TOKEN", required = false) String adminToken,
                                         @PathVariable Long id) {
        if (!isAuthorized(adminToken)) return unauthorized();
        try {
            return ResponseEntity.ok(playlistAdminService.getPlaylist(id));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/playlists")
    public ResponseEntity<?> createPlaylist(@RequestHeader(value = "X-ADMIN-TOKEN", required = false) String adminToken,
                                            @RequestBody PlaylistRequest request) {
        if (!isAuthorized(adminToken)) return unauthorized();
        try {
            Playlist playlist = playlistAdminService.createPlaylist(request);
            return ResponseEntity.ok(playlist);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PutMapping("/playlists/{id}")
    public ResponseEntity<?> updatePlaylist(@RequestHeader(value = "X-ADMIN-TOKEN", required = false) String adminToken,
                                            @PathVariable Long id,
                                            @RequestBody PlaylistRequest request) {
        if (!isAuthorized(adminToken)) return unauthorized();
        try {
            Playlist playlist = playlistAdminService.updatePlaylist(id, request);
            return ResponseEntity.ok(playlist);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @DeleteMapping("/playlists/{id}")
    public ResponseEntity<?> deletePlaylist(@RequestHeader(value = "X-ADMIN-TOKEN", required = false) String adminToken,
                                            @PathVariable Long id) {
        if (!isAuthorized(adminToken)) return unauthorized();
        try {
            playlistAdminService.deletePlaylist(id);
            return ResponseEntity.ok("Playlist removida com sucesso.");
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/playlists/{id}/songs")
    public ResponseEntity<?> addSongs(@RequestHeader(value = "X-ADMIN-TOKEN", required = false) String adminToken,
                                      @PathVariable Long id,
                                      @RequestBody PlaylistSongsRequest request) {
        if (!isAuthorized(adminToken)) return unauthorized();
        try {
            Playlist playlist = playlistAdminService.addSongsToPlaylist(id, request.getSongIds());
            return ResponseEntity.ok(playlist);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @DeleteMapping("/playlists/{id}/songs/{songId}")
    public ResponseEntity<?> removeSong(@RequestHeader(value = "X-ADMIN-TOKEN", required = false) String adminToken,
                                        @PathVariable Long id,
                                        @PathVariable Long songId) {
        if (!isAuthorized(adminToken)) return unauthorized();
        try {
            Playlist playlist = playlistAdminService.removeSongFromPlaylist(id, songId);
            return ResponseEntity.ok(playlist);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @GetMapping("/songs/search")
    public ResponseEntity<?> searchSongs(@RequestHeader(value = "X-ADMIN-TOKEN", required = false) String adminToken,
                                         @RequestParam(required = false, defaultValue = "") String q) {
        if (!isAuthorized(adminToken)) return unauthorized();
        List<Song> songs = playlistAdminService.searchSongs(q);
        return ResponseEntity.ok(songs);
    }

    @GetMapping("/songs/search-external")
    public ResponseEntity<?> searchExternalSongs(@RequestHeader(value = "X-ADMIN-TOKEN", required = false) String adminToken,
                                                 @RequestParam(required = false, defaultValue = "") String q) {
        if (!isAuthorized(adminToken)) return unauthorized();
        try {
            if (q == null || q.trim().isEmpty()) {
                return ResponseEntity.ok(java.util.Collections.emptyList());
            }
            List<Map<String, String>> songs = musicService.buscarNoYouTube(q.trim());
            return ResponseEntity.ok(songs);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Falha na busca externa: " + e.getMessage());
        }
    }

    @GetMapping("/musicas/buscar")
    public ResponseEntity<?> searchExternalSongsCompat(@RequestHeader(value = "X-ADMIN-TOKEN", required = false) String adminToken,
                                                       @RequestParam(required = false, defaultValue = "") String q) {
        return searchExternalSongs(adminToken, q);
    }

    @PostMapping("/songs/import")
    public ResponseEntity<?> importSong(@RequestHeader(value = "X-ADMIN-TOKEN", required = false) String adminToken,
                                        @RequestBody SongRequest request) {
        if (!isAuthorized(adminToken)) return unauthorized();
        try {
            Song song = playlistAdminService.importSong(request);
            return ResponseEntity.ok(song);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    private boolean isAuthorized(String token) {
        return adminSessionService.validateToken(token);
    }

    private ResponseEntity<String> unauthorized() {
        return ResponseEntity.status(401).body("Token admin inválido ou expirado.");
    }
}