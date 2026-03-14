package me.samulsz.musicapi.dto;

import me.samulsz.musicapi.models.Song;

import java.util.Set;

public class AuthResponse {
    private String token;
    private String username;
    private Set<Song> downloadedSongs;

    public AuthResponse(String token, String username, Set<Song> downloadedSongs) {
        this.token = token;
        this.username = username;
        this.downloadedSongs = downloadedSongs;
    }

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public Set<Song> getDownloadedSongs() { return downloadedSongs; }
    public void setDownloadedSongs(Set<Song> downloadedSongs) { this.downloadedSongs = downloadedSongs; }
}