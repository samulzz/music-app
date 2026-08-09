package me.samulsz.musicapi.services;

import me.samulsz.musicapi.dto.PlaylistRequest;
import me.samulsz.musicapi.models.Playlist;
import me.samulsz.musicapi.models.Song;
import me.samulsz.musicapi.models.User;
import me.samulsz.musicapi.repositories.PlaylistRepository;
import me.samulsz.musicapi.repositories.SongRepository;
import me.samulsz.musicapi.repositories.UserRepository;
import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
public class PersonalPlaylistService {

    private final PlaylistRepository playlistRepository;
    private final SongRepository songRepository;
    private final UserRepository userRepository;

    public PersonalPlaylistService(
            PlaylistRepository playlistRepository,
            SongRepository songRepository,
            UserRepository userRepository
    ) {
        this.playlistRepository = playlistRepository;
        this.songRepository = songRepository;
        this.userRepository = userRepository;
    }

    public List<Playlist> listPlaylists(String username) {
        return playlistRepository.findByOwnerUsernameOrderByIdDesc(username);
    }

    public Playlist createPlaylist(String username, PlaylistRequest request) {
        User owner = getUser(username);
        Playlist playlist = new Playlist();
        applyPayload(playlist, request);
        playlist.setGlobalPlaylist(false);
        playlist.setOwner(owner);
        return playlistRepository.save(playlist);
    }

    public Playlist updatePlaylist(String username, Long playlistId, PlaylistRequest request) {
        Playlist playlist = getOwnedPlaylist(username, playlistId);
        applyPayload(playlist, request);
        playlist.setGlobalPlaylist(false);
        return playlistRepository.save(playlist);
    }

    public void deletePlaylist(String username, Long playlistId) {
        Playlist playlist = getOwnedPlaylist(username, playlistId);
        playlistRepository.delete(playlist);
    }

    public Playlist getPlaylist(String username, Long playlistId) {
        return getOwnedPlaylist(username, playlistId);
    }

    public List<Song> getPlaylistSongs(String username, Long playlistId) {
        return SongOrder.alphabetically(getOwnedPlaylist(username, playlistId).getSongs());
    }

    public Playlist addSongs(String username, Long playlistId, List<Long> songIds) {
        Playlist playlist = getOwnedPlaylist(username, playlistId);
        if (songIds == null || songIds.isEmpty()) return playlist;

        User owner = getUser(username);
        Set<Long> libraryIds = new LinkedHashSet<>();
        for (Song song : owner.getDownloadedSongs()) {
            libraryIds.add(song.getId());
        }

        Set<Song> merged = new LinkedHashSet<>(playlist.getSongs());
        for (Long songId : songIds) {
            if (!libraryIds.contains(songId)) {
                throw new RuntimeException("Adicione a música à sua biblioteca antes de colocá-la em uma playlist.");
            }
            Song song = songRepository.findById(songId)
                    .orElseThrow(() -> new RuntimeException("Música não encontrada: " + songId));
            merged.add(song);
        }

        playlist.setSongs(merged);
        return playlistRepository.save(playlist);
    }

    public Playlist removeSong(String username, Long playlistId, Long songId) {
        Playlist playlist = getOwnedPlaylist(username, playlistId);
        Set<Song> filtered = new LinkedHashSet<>(playlist.getSongs());
        filtered.removeIf(song -> song.getId().equals(songId));
        playlist.setSongs(filtered);
        return playlistRepository.save(playlist);
    }

    private Playlist getOwnedPlaylist(String username, Long playlistId) {
        Playlist playlist = playlistRepository.findById(playlistId)
                .orElseThrow(() -> new RuntimeException("Playlist não encontrada."));
        if (playlist.getOwner() == null || !username.equals(playlist.getOwner().getUsername())) {
            throw new RuntimeException("Playlist não encontrada.");
        }
        return playlist;
    }

    private User getUser(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("Usuário não encontrado."));
    }

    private void applyPayload(Playlist playlist, PlaylistRequest request) {
        if (request == null || request.getName() == null || request.getName().trim().isEmpty()) {
            throw new RuntimeException("Nome da playlist é obrigatório.");
        }
        playlist.setName(request.getName().trim());
        playlist.setDescription(safeTrim(request.getDescription()));
        playlist.setIconUrl(safeTrim(request.getIconUrl()));
    }

    private String safeTrim(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
