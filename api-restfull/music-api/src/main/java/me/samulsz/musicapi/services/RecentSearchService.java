package me.samulsz.musicapi.services;
import me.samulsz.musicapi.models.*;
import me.samulsz.musicapi.repositories.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

@Service
public class RecentSearchService {
    private final RecentSearchSongRepository history;
    private final UserRepository users;
    private final SongRepository songs;
    public RecentSearchService(RecentSearchSongRepository history, UserRepository users, SongRepository songs) {
        this.history = history; this.users = users; this.songs = songs;
    }
    @Transactional(readOnly = true)
    public List<Song> list(String username) {
        return history.findTop20ByUserUsernameOrderBySearchedAtDesc(username).stream().map(entry -> entry.song).toList();
    }
    @Transactional
    public void record(String username, Long songId) {
        User user = users.findByUsernameForUpdate(username).orElseThrow();
        Song song = songs.findById(songId).orElseThrow(() -> new IllegalArgumentException("Música não encontrada."));
        RecentSearchSong entry = history.findByUserUsernameAndSongId(username, songId).orElseGet(RecentSearchSong::new);
        entry.user = user; entry.song = song; entry.searchedAt = System.currentTimeMillis(); history.save(entry);
    }
}
