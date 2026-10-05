package me.samulsz.musicapi.controllers;

import me.samulsz.musicapi.services.ListeningStatsService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/listening-stats")
public class ListeningStatsController {
    private final ListeningStatsService stats;
    public ListeningStatsController(ListeningStatsService stats) { this.stats = stats; }
    @GetMapping
    public ListeningStatsService.Capsule monthly(Authentication auth, @RequestParam(required = false) String month) {
        return stats.monthly(auth.getName(), month);
    }
    @PostMapping
    public void record(Authentication auth, @RequestBody ListeningStatsService.Listen request) {
        stats.record(auth.getName(), request);
    }
}
