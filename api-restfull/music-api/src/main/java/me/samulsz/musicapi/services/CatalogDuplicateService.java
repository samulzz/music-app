package me.samulsz.musicapi.services;

import me.samulsz.musicapi.repositories.PlaylistRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.LinkedHashSet;

@Service
public class CatalogDuplicateService {
    private final PlaylistRepository playlists;
    private final MusicService music;
    private final CatalogCurationStatusService status;
    private int page;
    public CatalogDuplicateService(PlaylistRepository playlists, MusicService music, CatalogCurationStatusService status) {
        this.playlists = playlists; this.music = music; this.status = status;
    }
    @Scheduled(initialDelay = 120_000, fixedDelay = 600_000)
    @Transactional
    public synchronized void consolidate() {
        var batch = playlists.findByGlobalPlaylistTrueOrderByIdAsc(PageRequest.of(page, 2));
        page = batch.hasNext() ? page + 1 : 0;
        for (var playlist : batch) {
            var selected = CatalogIdentity.unique(playlist.getSongs(), song -> music.hasPrecachedAudio(song.getSourceId()));
            int removed = playlist.getSongs().size() - selected.size();
            if (removed == 0) continue;
            // Consolidate references only. Never delete audio, song IDs, private playlists or listening history.
            playlist.setSongs(new LinkedHashSet<>(selected));
            playlists.save(playlist);
            status.audioIssue(new CatalogCurationStatusService.AudioIssue("playlist:" + playlist.getId(),
                    playlist.getName(), "Catálogo", "DUPLICATE_ENTRIES_CONSOLIDATED:" + removed, 0, null, null, System.currentTimeMillis()));
        }
    }
}
