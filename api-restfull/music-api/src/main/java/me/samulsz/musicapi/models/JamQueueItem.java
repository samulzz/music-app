package me.samulsz.musicapi.models;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "jam_queue_items")
public class JamQueueItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id", nullable = false)
    private JamRoom room;

    @Column(nullable = false)
    private int positionIndex;

    @Column(name = "song_id_value")
    private String songId = "";

    @Column(name = "song_source_id")
    private String songSourceId = "";

    @Column(name = "song_title")
    private String songTitle = "";

    @Column(name = "song_artist")
    private String songArtist = "";

    @Column(name = "song_artwork_url", length = 1000)
    private String songArtworkUrl = "";

    @Column(name = "song_remote_url", length = 1000)
    private String songRemoteUrl = "";

    public Long getId() {
        return id;
    }

    public JamRoom getRoom() {
        return room;
    }

    public void setRoom(JamRoom room) {
        this.room = room;
    }

    public int getPositionIndex() {
        return positionIndex;
    }

    public void setPositionIndex(int positionIndex) {
        this.positionIndex = positionIndex;
    }

    public String getSongId() {
        return songId;
    }

    public void setSongId(String songId) {
        this.songId = songId;
    }

    public String getSongSourceId() {
        return songSourceId;
    }

    public void setSongSourceId(String songSourceId) {
        this.songSourceId = songSourceId;
    }

    public String getSongTitle() {
        return songTitle;
    }

    public void setSongTitle(String songTitle) {
        this.songTitle = songTitle;
    }

    public String getSongArtist() {
        return songArtist;
    }

    public void setSongArtist(String songArtist) {
        this.songArtist = songArtist;
    }

    public String getSongArtworkUrl() {
        return songArtworkUrl;
    }

    public void setSongArtworkUrl(String songArtworkUrl) {
        this.songArtworkUrl = songArtworkUrl;
    }

    public String getSongRemoteUrl() {
        return songRemoteUrl;
    }

    public void setSongRemoteUrl(String songRemoteUrl) {
        this.songRemoteUrl = songRemoteUrl;
    }
}
