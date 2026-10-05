package me.samulsz.musicapi.controllers;

import me.samulsz.musicapi.dto.PlaybackReportRequest;
import me.samulsz.musicapi.dto.RecommendationFeedbackRequest;
import me.samulsz.musicapi.services.RecommendationService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/recommendations")
public class RecommendationController {

    private final RecommendationService recommendationService;

    public RecommendationController(RecommendationService recommendationService) {
        this.recommendationService = recommendationService;
    }

    @GetMapping("/daily")
    public ResponseEntity<?> daily(Authentication authentication) {
        try {
            return ResponseEntity.ok(recommendationService.getDailyMix(authentication.getName()));
        } catch (Exception error) {
            return ResponseEntity.badRequest().body(error.getMessage());
        }
    }

    @GetMapping("/home")
    public ResponseEntity<?> home(Authentication authentication) {
        try {
            return ResponseEntity.ok(recommendationService.getPersonalizedHome(authentication.getName()));
        } catch (Exception error) {
            return ResponseEntity.badRequest().body(error.getMessage());
        }
    }

    @PostMapping("/listen")
    public ResponseEntity<?> listen(
            Authentication authentication,
            @RequestBody PlaybackReportRequest request
    ) {
        try {
            recommendationService.reportPlayback(authentication.getName(), request);
            return ResponseEntity.noContent().build();
        } catch (Exception error) {
            return ResponseEntity.badRequest().body(error.getMessage());
        }
    }

    @PutMapping("/feedback")
    public ResponseEntity<?> feedback(Authentication authentication, @RequestBody RecommendationFeedbackRequest request) {
        try {
            recommendationService.setFeedback(authentication.getName(), request);
            return ResponseEntity.noContent().build();
        } catch (Exception error) {
            return ResponseEntity.badRequest().body(error.getMessage());
        }
    }

    @GetMapping("/feedback")
    public ResponseEntity<?> feedbackState(Authentication auth, @RequestParam(required = false) Long songId,
                                            @RequestParam(defaultValue = "") String sourceId) {
        return ResponseEntity.ok(recommendationService.feedback(auth.getName(), songId, sourceId));
    }

    @GetMapping("/radio")
    public ResponseEntity<?> radio(Authentication auth, @RequestParam(defaultValue = "") String sourceId,
                                   @RequestParam(defaultValue = "30") int limit,
                                   @RequestParam(defaultValue = "") String exclude) {
        var excluded = java.util.Arrays.stream(exclude.split(",")).map(String::trim).filter(s -> !s.isBlank()).limit(200).collect(java.util.stream.Collectors.toSet());
        return ResponseEntity.ok(recommendationService.radio(auth.getName(), sourceId, limit, excluded));
    }
}
