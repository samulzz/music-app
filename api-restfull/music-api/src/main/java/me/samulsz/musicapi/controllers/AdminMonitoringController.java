package me.samulsz.musicapi.controllers;

import me.samulsz.musicapi.services.AdminSessionService;
import me.samulsz.musicapi.services.PlaybackTelemetryService;
import me.samulsz.musicapi.services.CatalogMonitoringService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/monitoring")
public class AdminMonitoringController {
    private final AdminSessionService adminSessions;
    private final PlaybackTelemetryService telemetry;
    private final CatalogMonitoringService catalogMonitoring;

    public AdminMonitoringController(AdminSessionService adminSessions, PlaybackTelemetryService telemetry, CatalogMonitoringService catalogMonitoring) {
        this.adminSessions = adminSessions;
        this.telemetry = telemetry;
        this.catalogMonitoring = catalogMonitoring;
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
}
