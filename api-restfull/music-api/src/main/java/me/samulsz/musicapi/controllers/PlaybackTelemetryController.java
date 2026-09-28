package me.samulsz.musicapi.controllers;

import me.samulsz.musicapi.dto.PlaybackTelemetryRequest;
import me.samulsz.musicapi.services.PlaybackTelemetryService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/telemetry")
public class PlaybackTelemetryController {
    private final PlaybackTelemetryService telemetry;

    public PlaybackTelemetryController(PlaybackTelemetryService telemetry) {
        this.telemetry = telemetry;
    }

    @PostMapping("/events")
    public ResponseEntity<?> record(Authentication authentication, @RequestBody PlaybackTelemetryRequest request) {
        try {
            telemetry.record(authentication.getName(), request);
            return ResponseEntity.noContent().build();
        } catch (Exception error) {
            return ResponseEntity.badRequest().body(error.getMessage());
        }
    }
}
