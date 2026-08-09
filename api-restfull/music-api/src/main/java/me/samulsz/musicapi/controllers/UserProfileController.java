package me.samulsz.musicapi.controllers;

import me.samulsz.musicapi.dto.UserProfileUpdateRequest;
import me.samulsz.musicapi.services.FriendPresenceService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/user/profile")
public class UserProfileController {

    private final FriendPresenceService presenceService;

    public UserProfileController(FriendPresenceService presenceService) {
        this.presenceService = presenceService;
    }

    @GetMapping
    public ResponseEntity<?> get(Authentication authentication) {
        try {
            return ResponseEntity.ok(presenceService.getProfile(authentication.getName()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PutMapping
    public ResponseEntity<?> update(
            Authentication authentication,
            @RequestBody(required = false) UserProfileUpdateRequest request
    ) {
        try {
            return ResponseEntity.ok(presenceService.updateProfile(authentication.getName(), request));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }
}
