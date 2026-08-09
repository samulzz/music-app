package me.samulsz.musicapi.controllers;

import me.samulsz.musicapi.dto.JamSettingsRequest;
import me.samulsz.musicapi.dto.JamStateRequest;
import me.samulsz.musicapi.services.JamService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/jams")
public class JamController {

    private final JamService jamService;

    public JamController(JamService jamService) {
        this.jamService = jamService;
    }

    @PostMapping
    public ResponseEntity<?> create(Authentication authentication, @RequestBody JamStateRequest request) {
        try {
            return ResponseEntity.ok(jamService.create(authentication.getName(), request));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/{code}/join")
    public ResponseEntity<?> join(Authentication authentication, @PathVariable String code) {
        try {
            return ResponseEntity.ok(jamService.join(authentication.getName(), code));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @GetMapping("/{code}")
    public ResponseEntity<?> get(Authentication authentication, @PathVariable String code) {
        try {
            return ResponseEntity.ok(jamService.get(authentication.getName(), code));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PutMapping("/{code}/state")
    public ResponseEntity<?> updateState(
            Authentication authentication,
            @PathVariable String code,
            @RequestBody JamStateRequest request
    ) {
        try {
            return ResponseEntity.ok(jamService.updateState(authentication.getName(), code, request));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PutMapping("/{code}/settings")
    public ResponseEntity<?> updateSettings(
            Authentication authentication,
            @PathVariable String code,
            @RequestBody(required = false) JamSettingsRequest request
    ) {
        try {
            return ResponseEntity.ok(jamService.updateSettings(authentication.getName(), code, request));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/{code}/queue")
    public ResponseEntity<?> addToQueue(
            Authentication authentication,
            @PathVariable String code,
            @RequestBody JamStateRequest request
    ) {
        try {
            return ResponseEntity.ok(jamService.addToQueue(authentication.getName(), code, request));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/{code}/leave")
    public ResponseEntity<?> leave(Authentication authentication, @PathVariable String code) {
        try {
            jamService.leave(authentication.getName(), code);
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }
}
