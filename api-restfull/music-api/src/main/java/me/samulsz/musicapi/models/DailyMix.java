package me.samulsz.musicapi.models;

import jakarta.persistence.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(
        name = "daily_mixes",
        uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "mix_date"})
)
public class DailyMix {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "mix_date", nullable = false)
    private LocalDate mixDate;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private LocalDateTime generatedAt;

    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(
            name = "daily_mix_songs",
            joinColumns = @JoinColumn(name = "daily_mix_id"),
            inverseJoinColumns = @JoinColumn(name = "song_id")
    )
    @OrderColumn(name = "position_index")
    private List<Song> songs = new ArrayList<>();

    public Long getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public LocalDate getMixDate() { return mixDate; }
    public void setMixDate(LocalDate mixDate) { this.mixDate = mixDate; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public LocalDateTime getGeneratedAt() { return generatedAt; }
    public void setGeneratedAt(LocalDateTime generatedAt) { this.generatedAt = generatedAt; }
    public List<Song> getSongs() { return songs; }
    public void setSongs(List<Song> songs) { this.songs = songs; }
}
