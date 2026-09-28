package me.samulsz.musicapi.services;

import org.springframework.stereotype.Service;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class CatalogCurationStatusService {
    private final AtomicReference<JobStatus> albums = new AtomicReference<>(JobStatus.idle("Aguardando primeira rodada"));
    private final AtomicReference<JobStatus> genres = new AtomicReference<>(JobStatus.idle("Aguardando primeira rodada"));

    public void albums(String state, String message, int processed, int changed) { albums.set(new JobStatus(state, message, processed, changed, System.currentTimeMillis())); }
    public void genres(String state, String message, int processed, int changed) { genres.set(new JobStatus(state, message, processed, changed, System.currentTimeMillis())); }
    public JobStatus albumStatus() { return albums.get(); }
    public JobStatus genreStatus() { return genres.get(); }

    public record JobStatus(String state, String message, int processed, int changed, long updatedAt) {
        static JobStatus idle(String message) { return new JobStatus("IDLE", message, 0, 0, 0); }
    }
}
