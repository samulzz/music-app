package me.samulsz.musicapi.controllers;

import me.samulsz.musicapi.dto.AdminLoginRequest;
import me.samulsz.musicapi.dto.AdminLoginResponse;
import me.samulsz.musicapi.services.AdminSessionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/auth")
public class AdminAuthController {

    private final AdminSessionService adminSessionService;

    public AdminAuthController(AdminSessionService adminSessionService) {
        this.adminSessionService = adminSessionService;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody AdminLoginRequest request) {
        try {
            String token = adminSessionService.login(request.getUsername(), request.getPassword());
            long expiresAt = adminSessionService.getExpiresAt(token);
            return ResponseEntity.ok(new AdminLoginResponse(request.getUsername(), token, expiresAt));
        } catch (Exception e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }
    }
}