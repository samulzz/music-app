package me.samulsz.musicapi.dto;

public class PlaylistRequest {
    private String name;
    private String description;
    private String iconUrl;
    private Boolean globalPlaylist;
    private String collectionType;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getIconUrl() {
        return iconUrl;
    }

    public void setIconUrl(String iconUrl) {
        this.iconUrl = iconUrl;
    }

    public Boolean getGlobalPlaylist() {
        return globalPlaylist;
    }

    public void setGlobalPlaylist(Boolean globalPlaylist) {
        this.globalPlaylist = globalPlaylist;
    }

    public String getCollectionType() { return collectionType; }
    public void setCollectionType(String collectionType) { this.collectionType = collectionType; }
}
