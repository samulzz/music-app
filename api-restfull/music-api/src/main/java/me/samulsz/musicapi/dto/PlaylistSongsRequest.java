package me.samulsz.musicapi.dto;

import java.util.List;

public class PlaylistSongsRequest {
    private List<Long> songIds;

    public List<Long> getSongIds() {
        return songIds;
    }

    public void setSongIds(List<Long> songIds) {
        this.songIds = songIds;
    }
}