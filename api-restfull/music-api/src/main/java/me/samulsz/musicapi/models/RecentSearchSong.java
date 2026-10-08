package me.samulsz.musicapi.models;

import jakarta.persistence.*;

@Entity
@Table(name = "recent_search_songs", uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "song_id"}))
public class RecentSearchSong {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @ManyToOne(optional = false) @JoinColumn(name = "user_id") public User user;
    @ManyToOne(optional = false) @JoinColumn(name = "song_id") public Song song;
    public long searchedAt;
}
