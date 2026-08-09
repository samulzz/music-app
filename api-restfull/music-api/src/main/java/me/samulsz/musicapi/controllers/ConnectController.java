package me.samulsz.musicapi.controllers;

import me.samulsz.musicapi.dto.ConnectControlRequest;
import me.samulsz.musicapi.dto.ConnectHeartbeatRequest;
import me.samulsz.musicapi.services.ConnectService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/connect")
public class ConnectController {
    private final ConnectService service;
    public ConnectController(ConnectService service) { this.service = service; }

    @PostMapping("/heartbeat")
    public ResponseEntity<?> heartbeat(Authentication auth, @RequestBody ConnectHeartbeatRequest request) {
        try { return ResponseEntity.ok(service.heartbeat(auth.getName(), request)); }
        catch (Exception error) { return ResponseEntity.badRequest().body(error.getMessage()); }
    }
    @GetMapping("/state")
    public ResponseEntity<?> state(Authentication auth, @RequestParam String deviceId, @RequestParam(defaultValue = "0") long processedRevision) {
        try { return ResponseEntity.ok(service.get(auth.getName(), deviceId, processedRevision)); }
        catch (Exception error) { return ResponseEntity.badRequest().body(error.getMessage()); }
    }
    @PostMapping("/control")
    public ResponseEntity<?> control(Authentication auth, @RequestBody ConnectControlRequest request) {
        try { return ResponseEntity.ok(service.control(auth.getName(), request)); }
        catch (Exception error) { return ResponseEntity.badRequest().body(error.getMessage()); }
    }
}
