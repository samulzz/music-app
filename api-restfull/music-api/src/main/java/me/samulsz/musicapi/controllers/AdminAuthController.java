package me.samulsz.musicapi.controllers;

import jakarta.servlet.http.HttpServletRequest;
import me.samulsz.musicapi.dto.AdminLoginRequest;
import me.samulsz.musicapi.dto.AdminLoginResponse;
import me.samulsz.musicapi.services.AdminSessionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/admin/auth")
public class AdminAuthController {

    private static final int MAX_ATTEMPTS = 8;
    private static final long ATTEMPT_WINDOW_MS = Duration.ofMinutes(10).toMillis();

    private final AdminSessionService adminSessionService;
    private final ConcurrentHashMap<String, LoginAttempts> loginAttempts = new ConcurrentHashMap<>();

    public AdminAuthController(AdminSessionService adminSessionService) {
        this.adminSessionService = adminSessionService;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody AdminLoginRequest request, HttpServletRequest servletRequest) {
        String remoteAddress = servletRequest.getRemoteAddr();
        if (isBlocked(remoteAddress)) {
            return ResponseEntity.status(429).body("Muitas tentativas. Aguarde alguns minutos.");
        }
        try {
            String token = adminSessionService.login(request.getUsername(), request.getPassword());
            long expiresAt = adminSessionService.getExpiresAt(token);
            loginAttempts.remove(remoteAddress);
            return ResponseEntity.ok(new AdminLoginResponse(request.getUsername(), token, expiresAt));
        } catch (Exception e) {
            recordFailure(remoteAddress);
            return ResponseEntity.status(401).body(e.getMessage());
        }
    }

    private boolean isBlocked(String address) {
        LoginAttempts attempts = loginAttempts.get(address);
        if (attempts == null) return false;
        if (System.currentTimeMillis() - attempts.startedAt > ATTEMPT_WINDOW_MS) {
            loginAttempts.remove(address, attempts);
            return false;
        }
        return attempts.count >= MAX_ATTEMPTS;
    }

    private void recordFailure(String address) {
        long now = System.currentTimeMillis();
        loginAttempts.compute(address, (key, current) -> {
            if (current == null || now - current.startedAt > ATTEMPT_WINDOW_MS) return new LoginAttempts(now, 1);
            return new LoginAttempts(current.startedAt, current.count + 1);
        });
    }

    private record LoginAttempts(long startedAt, int count) {}
}
