package me.samulsz.musicapi.services;

import me.samulsz.musicapi.dto.SongRequest;
import me.samulsz.musicapi.models.Song;
import me.samulsz.musicapi.models.User;
import me.samulsz.musicapi.repositories.SongRepository;
import me.samulsz.musicapi.repositories.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class SongService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SongRepository songRepository;

    public void saveSongForUser(String username, SongRequest request) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("Usuário não encontrado!"));

        Song song = null;
        if (request.getSourceId() != null && !request.getSourceId().isBlank()) {
            song = songRepository.findBySourceId(request.getSourceId()).orElse(null);
        }
        if (song == null && request.getUri() != null && !request.getUri().isBlank()) {
            song = songRepository.findByUri(request.getUri()).orElse(null);
        }

        if (song == null) {
            song = new Song();
        }

        song.setTitle(request.getTitle());
        song.setArtist(request.getArtist());
        song.setUri(request.getUri());
        song.setCoverUrl(request.getCoverUrl());
        if (request.getSourceId() != null && !request.getSourceId().isBlank()) {
            song.setSourceId(request.getSourceId());
        }

        song = songRepository.save(song);

        user.getDownloadedSongs().add(song);
        userRepository.save(user);
    }
    public java.util.Set<Song> getUserLibrary(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("Utilizador não encontrado!"));

        return user.getDownloadedSongs();
    }

    public void removeSongFromUser(String username, Long songId) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("Usuário não encontrado!"));

        boolean removed = user.getDownloadedSongs().removeIf(song -> song.getId().equals(songId));

        if (!removed) {
            throw new RuntimeException("Música não encontrada na sua biblioteca!");
        }

        userRepository.save(user);
    }
}