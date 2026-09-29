package me.samulsz.musicapi.services;

import me.samulsz.musicapi.models.CatalogImportPriority;
import me.samulsz.musicapi.models.Song;
import me.samulsz.musicapi.repositories.CatalogImportPriorityRepository;
import me.samulsz.musicapi.repositories.SongRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class CatalogAudioAuditService {
    private static final int BATCH_SIZE = 5;
    private static final String[] SUSPICIOUS_MARKERS = {
            "ao vivo", "live", "show completo", "instrumental", "karaoke", "playback",
            "slowed", "reverb", "nightcore", "8d audio", "cover"
    };

    private final SongRepository songs;
    private final CatalogImportPriorityRepository priorities;
    private final MusicService music;
    private final CatalogCurationStatusService status;
    private final AtomicInteger cursor = new AtomicInteger();

    public CatalogAudioAuditService(SongRepository songs, CatalogImportPriorityRepository priorities,
                                    MusicService music, CatalogCurationStatusService status) {
        this.songs = songs;
        this.priorities = priorities;
        this.music = music;
        this.status = status;
    }

    @Scheduled(initialDelay = 75_000, fixedDelay = 60_000)
    @Transactional
    public void auditNextBatch() {
        List<Song> catalog = songs.findAllCatalogSongs();
        if (catalog.isEmpty()) {
            status.audio("IDLE", "Catálogo vazio", 0, 0);
            return;
        }
        int start = Math.floorMod(cursor.getAndAdd(BATCH_SIZE), catalog.size());
        int issues = 0;
        for (int offset = 0; offset < Math.min(BATCH_SIZE, catalog.size()); offset++) {
            Song song = catalog.get((start + offset) % catalog.size());
            if (audit(song)) issues++;
        }
        int checked = Math.min(BATCH_SIZE, catalog.size());
        status.audio("IDLE", checked + " faixas verificadas · " + issues + " alerta(s)", checked, issues);
    }

    private boolean audit(Song song) {
        MusicService.AudioAudit result = music.auditCachedAudio(song.getSourceId());
        String issue = result.issue();
        if ("OK".equals(issue) && suspicious(song.getTitle())) issue = "SUSPICIOUS_VERSION";
        if ("OK".equals(issue) && duplicate(song)) issue = "DUPLICATE_METADATA";
        if ("OK".equals(issue)) return false;

        status.audioIssue(new CatalogCurationStatusService.AudioIssue(
                song.getSourceId(), song.getTitle(), song.getArtist(), issue, result.bytes(),
                result.durationSeconds(), result.bitrate(), System.currentTimeMillis()));

        if (!result.playable()) {
            music.invalidateCachedAudio(song.getSourceId());
            prioritizeRepair(song, result);
        }
        return true;
    }

    private boolean duplicate(Song song) {
        if (song.getTitle() == null || song.getArtist() == null) return false;
        return songs.findByTitleIgnoreCaseAndArtistIgnoreCase(song.getTitle(), song.getArtist()).stream()
                .anyMatch(other -> !other.getId().equals(song.getId()));
    }

    private boolean suspicious(String title) {
        String value = normalize(title);
        for (String marker : SUSPICIOUS_MARKERS) if (value.contains(marker)) return true;
        return false;
    }

    private void prioritizeRepair(Song song, MusicService.AudioAudit result) {
        String externalId = "audit:" + song.getSourceId();
        CatalogImportPriority priority = priorities.findByExternalTrackId(externalId).orElseGet(CatalogImportPriority::new);
        long now = System.currentTimeMillis();
        priority.setExternalTrackId(externalId);
        priority.setTitle(song.getTitle());
        priority.setArtist(song.getArtist());
        priority.setAlbum(song.getAlbum());
        priority.setAlbumArtist(song.getAlbumArtist());
        priority.setCoverUrl(song.getCoverUrl());
        if (result.durationSeconds() != null) priority.setDurationMs((int) Math.round(result.durationSeconds() * 1000));
        priority.setReason("Reparar áudio: " + result.issue());
        priority.setPriority(250);
        if (priority.getCreatedAt() == 0) priority.setCreatedAt(now);
        priority.setStatus("PENDING");
        priority.setUpdatedAt(now);
        priorities.save(priority);
    }

    private String normalize(String value) {
        return Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "").toLowerCase(Locale.ROOT).trim();
    }
}
