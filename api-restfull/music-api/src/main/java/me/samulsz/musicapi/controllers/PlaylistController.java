package me.samulsz.musicapi.controllers;

import me.samulsz.musicapi.services.PlaylistAdminService;
import me.samulsz.musicapi.dto.PlaylistRequest;
import me.samulsz.musicapi.dto.PlaylistSongsRequest;
import me.samulsz.musicapi.services.PersonalPlaylistService;
import me.samulsz.musicapi.repositories.SongRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/playlists")
public class PlaylistController {

    private final PlaylistAdminService playlistAdminService;
    private final PersonalPlaylistService personalPlaylistService;
    private final SongRepository songRepository;

    public PlaylistController(
            PlaylistAdminService playlistAdminService,
            PersonalPlaylistService personalPlaylistService,
            SongRepository songRepository
    ) {
        this.playlistAdminService = playlistAdminService;
        this.personalPlaylistService = personalPlaylistService;
        this.songRepository = songRepository;
    }

    @GetMapping("/personal")
    public ResponseEntity<?> listPersonal(Authentication authentication) {
        try {
            return ResponseEntity.ok(personalPlaylistService.listPlaylists(authentication.getName()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/personal")
    public ResponseEntity<?> createPersonal(Authentication authentication, @RequestBody PlaylistRequest request) {
        try {
            return ResponseEntity.ok(personalPlaylistService.createPlaylist(authentication.getName(), request));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @GetMapping("/personal/{id}")
    public ResponseEntity<?> getPersonal(Authentication authentication, @PathVariable Long id) {
        try {
            return ResponseEntity.ok(personalPlaylistService.getPlaylist(authentication.getName(), id));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PutMapping("/personal/{id}")
    public ResponseEntity<?> updatePersonal(
            Authentication authentication,
            @PathVariable Long id,
            @RequestBody PlaylistRequest request
    ) {
        try {
            return ResponseEntity.ok(personalPlaylistService.updatePlaylist(authentication.getName(), id, request));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @DeleteMapping("/personal/{id}")
    public ResponseEntity<?> deletePersonal(Authentication authentication, @PathVariable Long id) {
        try {
            personalPlaylistService.deletePlaylist(authentication.getName(), id);
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @GetMapping("/personal/{id}/songs")
    public ResponseEntity<?> getPersonalSongs(Authentication authentication, @PathVariable Long id) {
        try {
            return ResponseEntity.ok(personalPlaylistService.getPlaylistSongs(authentication.getName(), id));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/personal/{id}/songs")
    public ResponseEntity<?> addPersonalSongs(
            Authentication authentication,
            @PathVariable Long id,
            @RequestBody PlaylistSongsRequest request
    ) {
        try {
            return ResponseEntity.ok(personalPlaylistService.addSongs(authentication.getName(), id, request.getSongIds()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/personal/{id}/songs/{songId}")
    public ResponseEntity<?> addPersonalSong(
            Authentication authentication,
            @PathVariable Long id,
            @PathVariable Long songId
    ) {
        try {
            return ResponseEntity.ok(personalPlaylistService.addSongs(authentication.getName(), id, java.util.List.of(songId)));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @DeleteMapping("/personal/{id}/songs/{songId}")
    public ResponseEntity<?> removePersonalSong(
            Authentication authentication,
            @PathVariable Long id,
            @PathVariable Long songId
    ) {
        try {
            return ResponseEntity.ok(personalPlaylistService.removeSong(authentication.getName(), id, songId));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
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
            return ResponseEntity.ok(playlistAdminService.getPlaylistSongs(id));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }
}
