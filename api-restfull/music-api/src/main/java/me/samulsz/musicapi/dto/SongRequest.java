package me.samulsz.musicapi.dto;

import java.util.Set;

public class SongRequest {
    private String title;
    private String artist;
    private String album;
    private String albumArtist;
    private String uri;
    private String coverUrl;
    private String sourceId;
    private Set<String> genres;

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getArtist() { return artist; }
    public void setArtist(String artist) { this.artist = artist; }
    public String getAlbum() { return album; }
    public void setAlbum(String album) { this.album = album; }
    public String getAlbumArtist() { return albumArtist; }
    public void setAlbumArtist(String albumArtist) { this.albumArtist = albumArtist; }
    public String getUri() { return uri; }
    public void setUri(String uri) { this.uri = uri; }
    public String getCoverUrl() { return coverUrl; }
    public void setCoverUrl(String coverUrl) { this.coverUrl = coverUrl; }
    public String getSourceId() { return sourceId; }
    public void setSourceId(String sourceId) { this.sourceId = sourceId; }
    public Set<String> getGenres() { return genres; }
    public void setGenres(Set<String> genres) { this.genres = genres; }
}
