package me.samulsz.musicapi.controllers;
import me.samulsz.musicapi.repositories.CatalogImportPriorityRepository;
import me.samulsz.musicapi.services.AdminSessionService;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/import-priorities")
public class AdminImportPriorityController {
    private final CatalogImportPriorityRepository priorities;
    private final AdminSessionService sessions;
    public AdminImportPriorityController(CatalogImportPriorityRepository priorities, AdminSessionService sessions) { this.priorities=priorities; this.sessions=sessions; }
    @GetMapping public ResponseEntity<?> list(@RequestHeader(value="X-ADMIN-TOKEN", required=false) String token, @RequestParam(defaultValue="30") int limit, @RequestParam(defaultValue="false") boolean userRequestsOnly, @RequestParam(defaultValue="0") long createdAfter) {
        if(!sessions.validateToken(token)) return ResponseEntity.status(401).build();
        var page = PageRequest.of(0,Math.max(1,Math.min(100,limit)));
        return ResponseEntity.ok(userRequestsOnly
                ? priorities.findByStatusAndReasonAndCreatedAtGreaterThanEqualOrderByPriorityDescCreatedAtAsc("PENDING", "Playlist importada por usuário", Math.max(0, createdAfter), page)
                : priorities.findByStatusOrderByPriorityDescCreatedAtAsc("PENDING",page));
    }
    @PostMapping("/{externalId}/done") public ResponseEntity<?> done(@RequestHeader(value="X-ADMIN-TOKEN", required=false) String token,@PathVariable String externalId) {
        if(!sessions.validateToken(token)) return ResponseEntity.status(401).build();
        var item=priorities.findByExternalTrackId(externalId).orElseThrow();
        item.setStatus("IMPORTED"); item.setUpdatedAt(System.currentTimeMillis()); priorities.save(item); return ResponseEntity.noContent().build();
    }
}
