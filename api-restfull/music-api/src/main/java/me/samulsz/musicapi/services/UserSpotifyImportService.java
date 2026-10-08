package me.samulsz.musicapi.services;
import me.samulsz.musicapi.models.*;
import me.samulsz.musicapi.repositories.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.scheduling.annotation.Scheduled;
import java.util.*;

@Service
public class UserSpotifyImportService {
    private final SpotifyPlaylistService spotify;
    private final PlaylistRepository playlists;
    private final SongRepository songs;
    private final UserRepository users;
    private final CatalogImportPriorityRepository priorities;
    private final MusicService music;
    private final java.util.concurrent.atomic.AtomicInteger resolvePage = new java.util.concurrent.atomic.AtomicInteger();
    public UserSpotifyImportService(SpotifyPlaylistService spotify, PlaylistRepository playlists, SongRepository songs,
            UserRepository users, CatalogImportPriorityRepository priorities, MusicService music) {
        this.spotify=spotify; this.playlists=playlists; this.songs=songs; this.users=users; this.priorities=priorities; this.music=music;
    }
    @Transactional
    public Playlist importPlaylist(String username, String url) {
        var preview=spotify.preview(url);
        if(preview.truncated()) throw new IllegalArgumentException("Esta playlist excede o limite de 1000 faixas ou não pôde ser lida por completo. Nenhuma playlist foi criada.");
        if (!"playlist".equals(preview.type())) throw new IllegalArgumentException("Informe um link de playlist pública do Spotify.");
        User owner=users.findByUsernameForUpdate(username).orElseThrow();
        String marker="Spotify: "+preview.spotifyId();
        Playlist playlist=playlists.findByOwnerUsernameOrderByIdDesc(username).stream()
                .filter(p -> marker.equals(p.getDescription())).findFirst().orElseGet(Playlist::new);
        playlist.setOwner(owner); playlist.setGlobalPlaylist(false); playlist.setName(preview.name());
        playlist.setIconUrl(preview.coverUrl()); playlist.setDescription(marker);
        List<Song> catalog=songs.findAllCatalogSongs();
        List<PendingPlaylistTrack> pending=new ArrayList<>();
        Set<Song> linked=new LinkedHashSet<>(playlist.getSongs());
        for(var track: preview.tracks()) {
            var match=find(catalog, track.title(), track.artist());
            if(match.isPresent()) { linked.add(match.get()); continue; }
            pending.add(new PendingPlaylistTrack(track.spotifyId(),track.title(),track.artist(),track.durationMs()));
            String externalId="spotify:track:"+track.spotifyId();
            CatalogImportPriority priority=priorities.findByExternalTrackId(externalId).orElseGet(CatalogImportPriority::new);
            priority.setExternalTrackId(externalId); priority.setTitle(track.title()); priority.setArtist(track.artist());
            priority.setDurationMs(track.durationMs()); priority.setCoverUrl(preview.coverUrl());
            priority.setReason("Playlist importada por usuário"); priority.setPriority(Math.max(200,priority.getPriority()));
            priority.setStatus("PENDING"); long now=System.currentTimeMillis();
            if(priority.getCreatedAt()==0) priority.setCreatedAt(now);
            priority.setUpdatedAt(now); priorities.save(priority);
        }
        playlist.setSongs(linked); playlist.setPendingTracks(pending);
        return playlists.save(playlist);
    }
    private Optional<Song> find(List<Song> catalog,String title,String artist) {
        return catalog.stream().filter(song -> CatalogIdentity.title(title).equals(CatalogIdentity.title(song.getTitle()))
                && CatalogIdentity.normalize(artist).equals(CatalogIdentity.normalize(song.getArtist()))
                && music.hasPrecachedAudio(song.getSourceId())).findFirst();
    }
    @Scheduled(fixedDelay = 120000, initialDelay = 60000)
    @Transactional
    public void resolvePending() {
        long count=playlists.countPendingPlaylists();
        if(count==0) return;
        int page=Math.floorMod(resolvePage.getAndIncrement(),(int)((count+9)/10));
        var pendingPlaylists=playlists.findPendingPlaylists(org.springframework.data.domain.PageRequest.of(page,10));
        if(pendingPlaylists.isEmpty()) return;
        List<Song> catalog=songs.findAllCatalogSongs();
        for(Playlist playlist:pendingPlaylists) {
            if(playlist.getPendingTracks().isEmpty()) continue;
            boolean changed=playlist.getPendingTracks().removeIf(track -> {
                var match=find(catalog,track.title,track.artist);
                match.ifPresent(song -> playlist.getSongs().add(song)); return match.isPresent();
            });
            if(changed) playlists.save(playlist);
        }
    }
}
