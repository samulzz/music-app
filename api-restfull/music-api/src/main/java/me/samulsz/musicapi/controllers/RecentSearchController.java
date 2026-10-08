package me.samulsz.musicapi.controllers;
import me.samulsz.musicapi.services.RecentSearchService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/search/recent")
public class RecentSearchController {
    private final RecentSearchService service;
    public RecentSearchController(RecentSearchService service) { this.service = service; }
    @GetMapping public Object list(Authentication auth) { return service.list(auth.getName()); }
    @PostMapping("/{songId}") public void record(Authentication auth, @PathVariable Long songId) { service.record(auth.getName(), songId); }
}
