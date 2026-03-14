package me.samulsz.musicapi.dto;

public class SongRequest {
    private String title;
    private String artist;
    private String uri;
    private String coverUrl;
    private String sourceId;

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getArtist() { return artist; }
    public void setArtist(String artist) { this.artist = artist; }
    public String getUri() { return uri; }
    public void setUri(String uri) { this.uri = uri; }
    public String getCoverUrl() { return coverUrl; }
    public void setCoverUrl(String coverUrl) { this.coverUrl = coverUrl; }
    public String getSourceId() { return sourceId; }
    public void setSourceId(String sourceId) { this.sourceId = sourceId; }
}