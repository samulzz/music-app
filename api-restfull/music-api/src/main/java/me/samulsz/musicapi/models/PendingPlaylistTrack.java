package me.samulsz.musicapi.models;
import jakarta.persistence.*;
@Embeddable
public class PendingPlaylistTrack {
    public String spotifyId;
    public String title;
    public String artist;
    public int durationMs;
    public PendingPlaylistTrack() {}
    public PendingPlaylistTrack(String spotifyId, String title, String artist, int durationMs) {
        this.spotifyId=spotifyId; this.title=title; this.artist=artist; this.durationMs=durationMs;
    }
}
