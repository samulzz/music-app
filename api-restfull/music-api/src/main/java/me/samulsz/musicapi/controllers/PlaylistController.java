package me.samulsz.musicapi.controllers;

import me.samulsz.musicapi.services.PlaylistAdminService;
import me.samulsz.musicapi.repositories.SongRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/playlists")
public class PlaylistController {

    private final PlaylistAdminService playlistAdminService;
    private final SongRepository songRepository;

    public PlaylistController(PlaylistAdminService playlistAdminService, SongRepository songRepository) {
        this.playlistAdminService = playlistAdminService;
        this.songRepository = songRepository;
    }

    @GetMapping("/global")
    public ResponseEntity<?> listGlobal() {
        return ResponseEntity.ok(playlistAdminService.listGlobalPlaylists());
    }

    @GetMapping("/most-downloaded/songs")
    public ResponseEntity<?> listMostDownloadedSongs() {
        return ResponseEntity.ok(songRepository.findMostDownloadedSongs());
    }

    @GetMapping("/{id}/songs")
    public ResponseEntity<?> getPlaylistSongs(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(playlistAdminService.getPlaylist(id).getSongs());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }
}