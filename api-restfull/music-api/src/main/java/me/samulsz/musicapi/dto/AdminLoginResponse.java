package me.samulsz.musicapi.dto;

public class AdminLoginResponse {
    private String username;
    private String adminToken;
    private long expiresAt;

    public AdminLoginResponse(String username, String adminToken, long expiresAt) {
        this.username = username;
        this.adminToken = adminToken;
        this.expiresAt = expiresAt;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getAdminToken() {
        return adminToken;
    }

    public void setAdminToken(String adminToken) {
        this.adminToken = adminToken;
    }

    public long getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(long expiresAt) {
        this.expiresAt = expiresAt;
    }
}