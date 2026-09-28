package me.samulsz.musicapi.controllers;

import me.samulsz.musicapi.services.CatalogDiscoveryService;
import me.samulsz.musicapi.models.CatalogImportPriority;
import me.samulsz.musicapi.repositories.CatalogImportPriorityRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/catalog")
public class CatalogDiscoveryController {
    private final CatalogDiscoveryService catalog;
    private final CatalogImportPriorityRepository priorities;

    public CatalogDiscoveryController(CatalogDiscoveryService catalog, CatalogImportPriorityRepository priorities) {
        this.catalog = catalog; this.priorities = priorities;
    }

    @GetMapping("/search")
    public ResponseEntity<?> search(@RequestParam(defaultValue = "") String q) {
        return ResponseEntity.ok(catalog.search(q));
    }

    @GetMapping("/albums")
    public ResponseEntity<?> albums() { return ResponseEntity.ok(catalog.listAlbums()); }

    @GetMapping("/import-priorities")
    public ResponseEntity<?> importPriorities(@RequestParam(defaultValue = "30") int limit) {
        return ResponseEntity.ok(priorities.findByStatusOrderByPriorityDescCreatedAtAsc("PENDING", PageRequest.of(0, Math.max(1, Math.min(limit, 100)))));
    }

    @PostMapping("/import-priorities/{externalId}/done")
    public ResponseEntity<?> completePriority(@PathVariable String externalId) {
        CatalogImportPriority item = priorities.findByExternalTrackId(externalId)
                .orElseThrow(() -> new IllegalArgumentException("Prioridade não encontrada."));
        item.setStatus("IMPORTED"); item.setUpdatedAt(System.currentTimeMillis()); priorities.save(item);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/albums/songs")
    public ResponseEntity<?> albumSongs(
            @RequestParam(defaultValue = "") String name,
            @RequestParam(defaultValue = "") String artist,
            @RequestParam(required = false) Long playlistId
    ) {
        return ResponseEntity.ok(catalog.albumSongs(name, artist, playlistId));
    }
}
