package me.samulsz.musicapi.services;

import me.samulsz.musicapi.models.ListeningEvent;
import me.samulsz.musicapi.models.Song;
import me.samulsz.musicapi.repositories.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class ListeningStatsService {
    private static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");
    private final ListeningEventRepository events;
    private final UserRepository users;
    private final SongRepository songs;
    public ListeningStatsService(ListeningEventRepository events, UserRepository users, SongRepository songs) {
        this.events = events; this.users = users; this.songs = songs;
    }
    public record Listen(String eventId, String sessionId, Long songId, String sourceId, int seconds, long occurredAt) {}
    public record Rank(String name, String subtitle, String coverUrl, long seconds, long minutes) {}
    public record Capsule(String month, String label, boolean complete, long seconds, long minutes,
                          int songs, int artists, int activeDays, int plays, List<Rank> topSongs,
                          List<Rank> topArtists, List<Rank> topGenres, List<String> availableMonths, Long trackingSince) {}

    @Transactional
    public void record(String username, Listen request) {
        if (request == null || request.seconds() < 1 || request.seconds() > 60)
            throw new IllegalArgumentException("Intervalo de escuta inválido.");
        UUID.fromString(request.eventId()); UUID.fromString(request.sessionId());
        var user = users.findByUsernameForUpdate(username).orElseThrow();
        if (events.existsById(request.eventId())) return;
        Song song = request.songId() == null ? null : songs.findById(request.songId()).orElse(null);
        if (song == null && request.sourceId() != null) song = songs.findBySourceId(request.sourceId()).orElse(null);
        if (song == null) return;
        long now = System.currentTimeMillis();
        long timestamp = request.occurredAt();
        if (timestamp > now + 60_000 || timestamp < now - Duration.ofDays(90).toMillis())
            throw new IllegalArgumentException("Data de escuta inválida.");
        ListeningEvent item = new ListeningEvent();
        item.id = request.eventId(); item.sessionId = request.sessionId(); item.userId = user.getId();
        item.songId = song.getId(); item.title = song.getTitle(); item.artist = song.getArtist();
        item.coverUrl = song.getCoverUrl(); item.genres = String.join(",", song.getGenres());
        item.seconds = request.seconds(); item.occurredAt = timestamp;
        events.save(item);
    }

    @Transactional(readOnly = true)
    public Capsule monthly(String username, String requestedMonth) {
        var user = users.findByUsername(username).orElseThrow();
        YearMonth current = YearMonth.now(ZONE);
        YearMonth month = requestedMonth == null || requestedMonth.isBlank() ? current : YearMonth.parse(requestedMonth);
        if (month.isAfter(current) || month.isBefore(current.minusYears(10))) throw new IllegalArgumentException("Mês inválido.");
        long start = month.atDay(1).atStartOfDay(ZONE).toInstant().toEpochMilli();
        long end = month.plusMonths(1).atDay(1).atStartOfDay(ZONE).toInstant().toEpochMilli();
        var rows = events.findByUserIdAndOccurredAtGreaterThanEqualAndOccurredAtLessThan(user.getId(), start, end);
        Map<String, Bucket> tracks = new HashMap<>(), artists = new HashMap<>(), genres = new HashMap<>();
        Set<LocalDate> days = new HashSet<>(); Set<String> sessions = new HashSet<>();
        long total = 0;
        for (var item : rows) {
            total += item.seconds; sessions.add(item.sessionId);
            days.add(Instant.ofEpochMilli(item.occurredAt).atZone(ZONE).toLocalDate());
            add(tracks, String.valueOf(item.songId), item.title, item.artist, item.coverUrl, item.seconds);
            String artist = Objects.toString(item.artist, "Artista desconhecido").split(",")[0].trim();
            add(artists, artist.toLowerCase(Locale.ROOT), artist, "", item.coverUrl, item.seconds);
            String[] labels = Objects.toString(item.genres, "").split(",");
            List<String> tagged = Arrays.stream(labels).filter(value -> !value.isBlank()).toList();
            if (tagged.isEmpty()) add(genres, "unknown", "Ainda sem gênero", "", "", item.seconds);
            else for (int i = 0; i < tagged.size(); i++) {
                String label = tagged.get(i);
                long share = item.seconds / tagged.size() + (i < item.seconds % tagged.size() ? 1 : 0);
                add(genres, label, label, "", "", share);
            }
        }
        ListeningEvent first = events.findFirstByUserIdOrderByOccurredAtAsc(user.getId());
        List<String> months = new ArrayList<>();
        YearMonth earliest = first == null ? current : YearMonth.from(Instant.ofEpochMilli(first.occurredAt).atZone(ZONE));
        for (YearMonth value = current; !value.isBefore(earliest); value = value.minusMonths(1)) months.add(value.toString());
        return new Capsule(month.toString(), month.atDay(1).format(DateTimeFormatter.ofPattern("MMMM yyyy", Locale.forLanguageTag("pt-BR"))),
                month.isBefore(current), total, total / 60, tracks.size(), artists.size(), days.size(), sessions.size(),
                ranking(tracks), ranking(artists), ranking(genres), months, first == null ? null : first.occurredAt);
    }
    private static class Bucket {
        String name, subtitle, cover; long seconds;
        Bucket(String name, String subtitle, String cover) { this.name = name; this.subtitle = subtitle; this.cover = cover; }
    }
    private void add(Map<String, Bucket> map, String key, String name, String subtitle, String cover, long seconds) {
        map.computeIfAbsent(key, ignored -> new Bucket(name, subtitle, cover)).seconds += seconds;
    }
    private List<Rank> ranking(Map<String, Bucket> map) {
        return map.values().stream().sorted(Comparator.comparingLong((Bucket item) -> item.seconds).reversed()
                .thenComparing(item -> item.name)).limit(5)
                .map(item -> new Rank(item.name, item.subtitle, item.cover, item.seconds, item.seconds / 60)).toList();
    }
}
