package me.samulsz.musicapi.dto;

/** Public discovery metadata only: never serialize the full playlist contents in search. */
public record PlaylistSearchResult(Long id, String name, String description, String iconUrl,
                                   boolean globalPlaylist, String collectionType, int songCount,
                                   String albumArtist, String artist) {
    public Long getId() { return id; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public String getIconUrl() { return iconUrl; }
    public String getCollectionType() { return collectionType; }
}
