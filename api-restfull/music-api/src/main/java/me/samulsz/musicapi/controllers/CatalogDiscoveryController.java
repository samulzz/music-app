package me.samulsz.musicapi.controllers;

import me.samulsz.musicapi.services.CatalogDiscoveryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/catalog")
public class CatalogDiscoveryController {
    private final CatalogDiscoveryService catalog;

    public CatalogDiscoveryController(CatalogDiscoveryService catalog) { this.catalog = catalog; }

    @GetMapping("/search")
    public ResponseEntity<?> search(@RequestParam(defaultValue = "") String q) {
        return ResponseEntity.ok(catalog.search(q));
    }

    @GetMapping("/albums")
    public ResponseEntity<?> albums() { return ResponseEntity.ok(catalog.listAlbums()); }

    @GetMapping("/albums/songs")
    public ResponseEntity<?> albumSongs(
            @RequestParam(defaultValue = "") String name,
            @RequestParam(defaultValue = "") String artist,
            @RequestParam(required = false) Long playlistId
    ) {
        return ResponseEntity.ok(catalog.albumSongs(name, artist, playlistId));
    }
}
