package me.samulsz.musicapi.services;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AdminSessionService {

    @Value("${admin.username}")
    private String adminUsername;

    @Value("${admin.password}")
    private String adminPassword;

    @Value("${admin.session.ttl-minutes:480}")
    private long sessionTtlMinutes;

    private final SecureRandom secureRandom = new SecureRandom();
    private final Map<String, Long> sessions = new ConcurrentHashMap<>();

    public String login(String username, String password) {
        if (username == null || password == null) {
            throw new RuntimeException("Credenciais admin inválidas.");
        }

        if (!adminUsername.equals(username.trim()) || !adminPassword.equals(password)) {
            throw new RuntimeException("Login admin inválido.");
        }

        byte[] bytes = new byte[48];
        secureRandom.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        long expiresAt = Instant.now().plusSeconds(sessionTtlMinutes * 60).toEpochMilli();
        sessions.put(token, expiresAt);
        return token;
    }

    public long getExpiresAt(String token) {
        Long expiresAt = sessions.get(token);
        if (expiresAt == null) return 0L;
        return expiresAt;
    }

    public boolean validateToken(String token) {
        if (token == null || token.isBlank()) {
            return false;
        }

        Long expiresAt = sessions.get(token);
        if (expiresAt == null) {
            return false;
        }

        if (expiresAt < Instant.now().toEpochMilli()) {
            sessions.remove(token);
            return false;
        }

        return true;
    }
}