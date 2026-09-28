package me.samulsz.musicapi.services;

import me.samulsz.musicapi.dto.PlaybackTelemetryRequest;
import me.samulsz.musicapi.models.PlaybackTelemetry;
import me.samulsz.musicapi.models.User;
import me.samulsz.musicapi.repositories.PlaybackTelemetryRepository;
import me.samulsz.musicapi.repositories.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

@Service
@Transactional
public class PlaybackTelemetryService {
    private static final Set<String> EVENT_TYPES = Set.of("LOAD_STARTED", "READY", "PLAYING", "WAITING", "STALLED", "ERROR", "ENDED");
    private static final Set<String> INCIDENT_TYPES = Set.of("WAITING", "STALLED", "ERROR");
    private static final int DASHBOARD_EVENT_LIMIT = 20_000;
    private static final long RETENTION_MS = Duration.ofDays(30).toMillis();
    private static final long CLEANUP_INTERVAL_MS = Duration.ofHours(6).toMillis();

    private final PlaybackTelemetryRepository events;
    private final UserRepository users;
    private final AtomicLong lastCleanupAt = new AtomicLong();

    public PlaybackTelemetryService(PlaybackTelemetryRepository events, UserRepository users) {
        this.events = events;
        this.users = users;
    }

    public void record(String username, PlaybackTelemetryRequest request) {
        if (request == null) throw new IllegalArgumentException("Evento ausente.");
        String eventType = clean(request.getEventType(), 24).toUpperCase(Locale.ROOT);
        if (!EVENT_TYPES.contains(eventType)) throw new IllegalArgumentException("Tipo de evento inválido.");
        User user = users.findByUsername(username).orElseThrow(() -> new IllegalArgumentException("Usuário não encontrado."));

        PlaybackTelemetry event = new PlaybackTelemetry();
        event.setUserId(user.getId());
        event.setSessionId(required(request.getSessionId(), 36, "Sessão de reprodução ausente."));
        event.setSongId(request.getSongId());
        event.setSourceId(clean(request.getSourceId(), 120));
        event.setTitle(clean(request.getTitle(), 240));
        event.setArtist(clean(request.getArtist(), 240));
        event.setEventType(eventType);
        event.setPlatform(normalizePlatform(request.getPlatform()));
        event.setAppVersion(clean(request.getAppVersion(), 32));
        event.setLoadTimeMs(clamp(request.getLoadTimeMs(), 0, Duration.ofMinutes(10).toMillis()));
        event.setPositionSeconds(clamp(request.getPositionSeconds(), 0, Duration.ofHours(24).toSeconds()));
        event.setMessage(clean(request.getMessage(), 500));
        event.setOccurredAt(System.currentTimeMillis());
        events.save(event);
        cleanupIfNeeded();
    }

    @Transactional(readOnly = true)
    public Dashboard dashboard(int requestedHours) {
        int hours = Math.max(1, Math.min(requestedHours, 24 * 7));
        long now = System.currentTimeMillis();
        long since = now - Duration.ofHours(hours).toMillis();
        List<PlaybackTelemetry> rows = events.findByOccurredAtGreaterThanEqualOrderByOccurredAtDesc(
                since, PageRequest.of(0, DASHBOARD_EVENT_LIMIT));

        List<Long> loadTimes = rows.stream()
                .filter(row -> "READY".equals(row.getEventType()) && row.getLoadTimeMs() != null)
                .map(PlaybackTelemetry::getLoadTimeMs)
                .sorted()
                .toList();
        double averageLoadMs = loadTimes.stream().mapToLong(Long::longValue).average().orElse(0);
        long p95LoadMs = percentile(loadTimes, 0.95);
        long incidents = rows.stream().filter(row -> INCIDENT_TYPES.contains(row.getEventType())).count();
        Set<String> startedSessions = rows.stream()
                .filter(row -> "LOAD_STARTED".equals(row.getEventType()))
                .map(PlaybackTelemetry::getSessionId).collect(Collectors.toSet());
        Set<String> affectedSessions = rows.stream()
                .filter(row -> INCIDENT_TYPES.contains(row.getEventType()))
                .map(PlaybackTelemetry::getSessionId).collect(Collectors.toSet());
        double affectedRate = startedSessions.isEmpty() ? 0 : affectedSessions.size() * 100.0 / startedSessions.size();

        Map<String, SongAccumulator> songs = new HashMap<>();
        for (PlaybackTelemetry row : rows) {
            String key = songKey(row);
            SongAccumulator accumulator = songs.computeIfAbsent(key, ignored -> new SongAccumulator(row));
            accumulator.add(row);
        }
        List<ProblemSong> problematicSongs = songs.values().stream()
                .filter(song -> song.score() > 0)
                .sorted(Comparator.comparingInt(SongAccumulator::score).reversed()
                        .thenComparing(Comparator.comparingInt(SongAccumulator::incidents).reversed()))
                .limit(20)
                .map(SongAccumulator::response)
                .toList();

        Map<Long, TimelineAccumulator> timeline = new TreeMap<>();
        long hourMs = Duration.ofHours(1).toMillis();
        for (long bucket = since - (since % hourMs); bucket <= now; bucket += hourMs) {
            timeline.put(bucket, new TimelineAccumulator(bucket));
        }
        rows.stream().filter(row -> INCIDENT_TYPES.contains(row.getEventType())).forEach(row -> {
            long bucket = row.getOccurredAt() - (row.getOccurredAt() % hourMs);
            timeline.computeIfAbsent(bucket, TimelineAccumulator::new).add(row.getEventType());
        });

        List<RecentIncident> recent = rows.stream()
                .filter(row -> INCIDENT_TYPES.contains(row.getEventType()))
                .limit(100)
                .map(row -> new RecentIncident(row.getOccurredAt(), row.getEventType(), row.getTitle(), row.getArtist(),
                        row.getSourceId(), row.getPlatform(), row.getAppVersion(), row.getPositionSeconds(), row.getMessage()))
                .toList();

        Map<String, Long> byPlatform = rows.stream().filter(row -> INCIDENT_TYPES.contains(row.getEventType()))
                .collect(Collectors.groupingBy(PlaybackTelemetry::getPlatform, TreeMap::new, Collectors.counting()));
        Summary summary = new Summary(rows.size(), startedSessions.size(), incidents, affectedSessions.size(), affectedRate,
                averageLoadMs, p95LoadMs,
                rows.stream().filter(row -> "ERROR".equals(row.getEventType())).count(),
                rows.stream().filter(row -> "WAITING".equals(row.getEventType())).count(),
                rows.stream().filter(row -> "STALLED".equals(row.getEventType())).count(),
                rows.size() >= DASHBOARD_EVENT_LIMIT);
        return new Dashboard(now, since, hours, summary, problematicSongs,
                timeline.values().stream().map(TimelineAccumulator::response).toList(), recent, byPlatform);
    }

    private void cleanupIfNeeded() {
        long now = System.currentTimeMillis();
        long previous = lastCleanupAt.get();
        if (now - previous < CLEANUP_INTERVAL_MS || !lastCleanupAt.compareAndSet(previous, now)) return;
        events.deleteByOccurredAtLessThan(now - RETENTION_MS);
    }

    private long percentile(List<Long> values, double percentile) {
        if (values.isEmpty()) return 0;
        int index = Math.max(0, (int) Math.ceil(values.size() * percentile) - 1);
        return values.get(Math.min(index, values.size() - 1));
    }

    private String songKey(PlaybackTelemetry row) {
        if (row.getSourceId() != null && !row.getSourceId().isBlank()) return "source:" + row.getSourceId();
        if (row.getSongId() != null) return "song:" + row.getSongId();
        return "title:" + row.getTitle() + "|" + row.getArtist();
    }

    private String normalizePlatform(String value) {
        String platform = clean(value, 24).toLowerCase(Locale.ROOT);
        return Set.of("desktop", "android", "ios").contains(platform) ? platform : "unknown";
    }

    private String required(String value, int max, String message) {
        String result = clean(value, max);
        if (result.isBlank()) throw new IllegalArgumentException(message);
        return result;
    }

    private String clean(String value, int max) {
        if (value == null) return "";
        String result = value.strip().replaceAll("[\\p{Cntrl}&&[^\\n\\t]]", "");
        return result.length() <= max ? result : result.substring(0, max);
    }

    private Long clamp(Long value, long min, long max) {
        return value == null ? null : Math.max(min, Math.min(max, value));
    }

    private Double clamp(Double value, double min, double max) {
        return value == null || !Double.isFinite(value) ? null : Math.max(min, Math.min(max, value));
    }

    public record Dashboard(long generatedAt, long since, int hours, Summary summary,
                            List<ProblemSong> problematicSongs, List<TimelinePoint> timeline,
                            List<RecentIncident> recentIncidents, Map<String, Long> incidentsByPlatform) {}
    public record Summary(int collectedEvents, int playbackSessions, long incidents, int affectedSessions,
                          double affectedSessionRate, double averageLoadMs, long p95LoadMs,
                          long errors, long waiting, long stalled, boolean truncated) {}
    public record ProblemSong(String sourceId, String title, String artist, int score, int incidents,
                              int errors, int waiting, int stalled, double averageLoadMs, long maxLoadMs) {}
    public record TimelinePoint(long timestamp, int errors, int waiting, int stalled) {}
    public record RecentIncident(long occurredAt, String eventType, String title, String artist, String sourceId,
                                 String platform, String appVersion, Double positionSeconds, String message) {}

    private static class SongAccumulator {
        private final String sourceId;
        private final String title;
        private final String artist;
        private int errors;
        private int waiting;
        private int stalled;
        private long loadTotal;
        private long maxLoad;
        private int loadCount;
        private int slowLoads;

        SongAccumulator(PlaybackTelemetry row) {
            sourceId = row.getSourceId(); title = row.getTitle(); artist = row.getArtist();
        }
        void add(PlaybackTelemetry row) {
            if ("ERROR".equals(row.getEventType())) errors++;
            if ("WAITING".equals(row.getEventType())) waiting++;
            if ("STALLED".equals(row.getEventType())) stalled++;
            if ("READY".equals(row.getEventType()) && row.getLoadTimeMs() != null) {
                loadTotal += row.getLoadTimeMs(); maxLoad = Math.max(maxLoad, row.getLoadTimeMs()); loadCount++;
                if (row.getLoadTimeMs() >= 5_000) slowLoads++;
            }
        }
        int incidents() { return errors + waiting + stalled; }
        int score() { return errors * 5 + stalled * 3 + waiting * 2 + slowLoads; }
        ProblemSong response() { return new ProblemSong(sourceId, title, artist, score(), incidents(), errors, waiting, stalled,
                loadCount == 0 ? 0 : (double) loadTotal / loadCount, maxLoad); }
    }

    private static class TimelineAccumulator {
        private final long timestamp; private int errors; private int waiting; private int stalled;
        TimelineAccumulator(long timestamp) { this.timestamp = timestamp; }
        void add(String type) { if ("ERROR".equals(type)) errors++; if ("WAITING".equals(type)) waiting++; if ("STALLED".equals(type)) stalled++; }
        TimelinePoint response() { return new TimelinePoint(timestamp, errors, waiting, stalled); }
    }
}
