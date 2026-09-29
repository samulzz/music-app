package me.samulsz.musicapi.services;

import org.springframework.stereotype.Service;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class CatalogCurationStatusService {
    private final AtomicReference<JobStatus> albums = new AtomicReference<>(JobStatus.idle("Aguardando primeira rodada"));
    private final AtomicReference<JobStatus> genres = new AtomicReference<>(JobStatus.idle("Aguardando primeira rodada"));
    private final AtomicReference<JobStatus> audio = new AtomicReference<>(JobStatus.idle("Aguardando primeira auditoria"));
    private final ArrayDeque<AudioIssue> audioIssues = new ArrayDeque<>();

    public void albums(String state, String message, int processed, int changed) { albums.set(new JobStatus(state, message, processed, changed, System.currentTimeMillis())); }
    public void genres(String state, String message, int processed, int changed) { genres.set(new JobStatus(state, message, processed, changed, System.currentTimeMillis())); }
    public void audio(String state, String message, int processed, int changed) { audio.set(new JobStatus(state, message, processed, changed, System.currentTimeMillis())); }
    public synchronized void audioIssue(AudioIssue issue) {
        audioIssues.removeIf(item -> item.sourceId().equals(issue.sourceId()));
        audioIssues.addFirst(issue);
        while (audioIssues.size() > 50) audioIssues.removeLast();
    }
    public JobStatus albumStatus() { return albums.get(); }
    public JobStatus genreStatus() { return genres.get(); }
    public JobStatus audioStatus() { return audio.get(); }
    public synchronized List<AudioIssue> audioIssues() { return new ArrayList<>(audioIssues); }

    public record JobStatus(String state, String message, int processed, int changed, long updatedAt) {
        static JobStatus idle(String message) { return new JobStatus("IDLE", message, 0, 0, 0); }
    }
    public record AudioIssue(String sourceId, String title, String artist, String issue,
                             long bytes, Double durationSeconds, Long bitrate, long detectedAt) {}
}
