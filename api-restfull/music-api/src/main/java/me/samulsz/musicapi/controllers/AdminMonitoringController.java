package me.samulsz.musicapi.controllers;

import me.samulsz.musicapi.services.AdminSessionService;
import me.samulsz.musicapi.services.PlaybackTelemetryService;
import me.samulsz.musicapi.services.CatalogMonitoringService;
import me.samulsz.musicapi.services.CatalogAudioAuditService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;

@RestController
@RequestMapping("/api/admin/monitoring")
public class AdminMonitoringController {
    private final AdminSessionService adminSessions;
    private final PlaybackTelemetryService telemetry;
    private final CatalogMonitoringService catalogMonitoring;
    private final CatalogAudioAuditService audioAudit;

    public AdminMonitoringController(AdminSessionService adminSessions, PlaybackTelemetryService telemetry, CatalogMonitoringService catalogMonitoring, CatalogAudioAuditService audioAudit) {
        this.adminSessions = adminSessions;
        this.telemetry = telemetry;
        this.catalogMonitoring = catalogMonitoring;
        this.audioAudit = audioAudit;
    }

    @GetMapping("/dashboard")
    public ResponseEntity<?> dashboard(
            @RequestHeader(value = "X-ADMIN-TOKEN", required = false) String adminToken,
            @RequestParam(defaultValue = "24") int hours
    ) {
        if (!adminSessions.validateToken(adminToken)) {
            return ResponseEntity.status(401).body("Token admin inválido ou expirado.");
        }
        return ResponseEntity.ok(telemetry.dashboard(hours));
    }

    @GetMapping("/catalog")
    public ResponseEntity<?> catalog(@RequestHeader(value = "X-ADMIN-TOKEN", required = false) String adminToken) {
        if (!adminSessions.validateToken(adminToken)) return ResponseEntity.status(401).body("Token admin inválido ou expirado.");
        return ResponseEntity.ok(catalogMonitoring.dashboard());
    }

    @PostMapping("/audio/{songId}/recheck")
    public ResponseEntity<?> recheck(@RequestHeader(value = "X-ADMIN-TOKEN", required = false) String token,
                                      @PathVariable long songId) {
        if (!adminSessions.validateToken(token)) return ResponseEntity.status(401).body("Token admin inválido ou expirado.");
        try { audioAudit.requestRecheck(songId); return ResponseEntity.accepted().body(java.util.Map.of("queued", true)); }
        catch (IllegalArgumentException error) { return ResponseEntity.badRequest().body(error.getMessage()); }
    }
}
