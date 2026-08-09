package me.samulsz.musicapi.controllers;

import me.samulsz.musicapi.dto.FriendPresenceRequest;
import me.samulsz.musicapi.dto.FriendRequestCreateRequest;
import me.samulsz.musicapi.services.FriendPresenceService;
import me.samulsz.musicapi.services.FriendService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/friends")
public class FriendController {

    private final FriendService friendService;
    private final FriendPresenceService presenceService;

    public FriendController(FriendService friendService, FriendPresenceService presenceService) {
        this.friendService = friendService;
        this.presenceService = presenceService;
    }

    @GetMapping
    public ResponseEntity<?> list(Authentication authentication) {
        try {
            return ResponseEntity.ok(friendService.listFriends(authentication.getName()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @GetMapping("/search")
    public ResponseEntity<?> search(Authentication authentication, @RequestParam(defaultValue = "") String q) {
        try {
            return ResponseEntity.ok(friendService.search(authentication.getName(), q));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @GetMapping("/requests")
    public ResponseEntity<?> requests(Authentication authentication) {
        try {
            return ResponseEntity.ok(friendService.listRequests(authentication.getName()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/request")
    public ResponseEntity<?> request(Authentication authentication, @RequestBody FriendRequestCreateRequest request) {
        try {
            return ResponseEntity.ok(friendService.requestFriend(authentication.getName(), request.username()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/requests/{id}/accept")
    public ResponseEntity<?> accept(Authentication authentication, @PathVariable Long id) {
        try {
            return ResponseEntity.ok(friendService.accept(authentication.getName(), id));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @DeleteMapping("/requests/{id}")
    public ResponseEntity<?> decline(Authentication authentication, @PathVariable Long id) {
        try {
            friendService.decline(authentication.getName(), id);
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @DeleteMapping("/{username}")
    public ResponseEntity<?> remove(Authentication authentication, @PathVariable String username) {
        try {
            friendService.remove(authentication.getName(), username);
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/presence")
    public ResponseEntity<?> updatePresence(
            Authentication authentication,
            @RequestBody(required = false) FriendPresenceRequest request
    ) {
        try {
            return ResponseEntity.ok(presenceService.update(authentication.getName(), request));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @DeleteMapping("/presence")
    public ResponseEntity<?> clearPresence(Authentication authentication) {
        presenceService.markOffline(authentication.getName());
        return ResponseEntity.noContent().build();
    }
}
