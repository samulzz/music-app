package me.samulsz.musicapi.controllers;

import me.samulsz.musicapi.dto.SongRequest;
import me.samulsz.musicapi.models.Song;
import me.samulsz.musicapi.services.SongService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Set;

@RestController
@RequestMapping("/api/songs")
public class SongController {

    @Autowired
    private SongService songService;

    @PostMapping("/save")
    public ResponseEntity<?> saveSong(Authentication authentication, @RequestBody SongRequest request) {
        try {
            String username = authentication.getName();
            songService.saveSongForUser(username, request);
            return ResponseEntity.ok("Música salva na biblioteca com sucesso!");
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Erro ao salvar: " + e.getMessage());
        }
    }
    @GetMapping("/my-library")
    public ResponseEntity<?> getMyLibrary(Authentication authentication) {
        try {
            String username = authentication.getName();
            Set<Song> mySongs = songService.getUserLibrary(username);
            return ResponseEntity.ok(mySongs);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Erro ao carregar a biblioteca: " + e.getMessage());
        }
    }

    @DeleteMapping("/remove/{songId}")
    public ResponseEntity<?> removeSong(Authentication authentication, @PathVariable Long songId) {
        try {
            String username = authentication.getName();
            songService.removeSongFromUser(username, songId);

            return ResponseEntity.ok("Música removida da biblioteca com sucesso!");
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Erro ao remover: " + e.getMessage());
        }
    }
}