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

    @Autowired
    private MusicService musicService;

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

    public java.util.List<Song> getUserLibrary(String username) {
        if (userRepository.findByUsername(username).isEmpty()) {
            throw new RuntimeException("Utilizador não encontrado!");
        }

        return songRepository.findLibraryByUsername(username);
    }

    public java.util.List<Song> searchPrecachedCatalog(String query) {
        String safeQuery = query == null ? "" : query.trim();
        return songRepository.searchCatalogSongs(safeQuery).stream()
                .filter(song -> musicService.hasPrecachedAudio(song.getSourceId()))
                .limit(50)
                .toList();
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
