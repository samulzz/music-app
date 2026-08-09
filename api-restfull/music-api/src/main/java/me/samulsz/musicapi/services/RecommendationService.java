package me.samulsz.musicapi.services;

import me.samulsz.musicapi.dto.DailyMixResponse;
import me.samulsz.musicapi.dto.PlaybackReportRequest;
import me.samulsz.musicapi.models.DailyMix;
import me.samulsz.musicapi.models.PlaybackPreference;
import me.samulsz.musicapi.models.Playlist;
import me.samulsz.musicapi.models.Song;
import me.samulsz.musicapi.models.User;
import me.samulsz.musicapi.repositories.DailyMixRepository;
import me.samulsz.musicapi.repositories.PlaybackPreferenceRepository;
import me.samulsz.musicapi.repositories.PlaylistRepository;
import me.samulsz.musicapi.repositories.SongRepository;
import me.samulsz.musicapi.repositories.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.Normalizer;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class RecommendationService {

    private static final int DAILY_SIZE = 100;
    private static final ZoneId APP_ZONE = ZoneId.of("America/Sao_Paulo");
    private static final List<String> MIX_NAMES = List.of(
            "Seu Som de Hoje",
            "Radar do Seu Ritmo",
            "Na Sua Frequência",
            "Descobertas para Você",
            "Vibe do Dia",
            "Seu Replay & Descobertas",
            "Sintonia de Hoje"
    );

    private final UserRepository userRepository;
    private final SongRepository songRepository;
    private final PlaylistRepository playlistRepository;
    private final PlaybackPreferenceRepository preferenceRepository;
    private final DailyMixRepository dailyMixRepository;
    private final MusicService musicService;

    public RecommendationService(
            UserRepository userRepository,
            SongRepository songRepository,
            PlaylistRepository playlistRepository,
            PlaybackPreferenceRepository preferenceRepository,
            DailyMixRepository dailyMixRepository,
            MusicService musicService
    ) {
        this.userRepository = userRepository;
        this.songRepository = songRepository;
        this.playlistRepository = playlistRepository;
        this.preferenceRepository = preferenceRepository;
        this.dailyMixRepository = dailyMixRepository;
        this.musicService = musicService;
    }

    @Transactional
    public void reportPlayback(String username, PlaybackReportRequest request) {
        if (request == null || (!request.completed() && request.listenedSeconds() < 15)) return;
        User user = getUser(username);
        Song song = resolveSong(request).orElse(null);
        if (song == null) return;

        PlaybackPreference preference = preferenceRepository
                .findByUserIdAndSongId(user.getId(), song.getId())
                .orElseGet(PlaybackPreference::new);
        preference.setUser(user);
        preference.setSong(song);
        preference.setPlayCount(preference.getPlayCount() + 1);
        if (request.completed()) {
            preference.setCompletedCount(preference.getCompletedCount() + 1);
        }
        long listened = Math.max(0, Math.min(request.listenedSeconds(), 60L * 60L));
        preference.setListenedSeconds(preference.getListenedSeconds() + listened);
        preference.setLastListenedAt(LocalDateTime.now(APP_ZONE));
        preferenceRepository.save(preference);
    }

    @Transactional
    public synchronized DailyMixResponse getDailyMix(String username) {
        User user = getUser(username);
        LocalDate today = LocalDate.now(APP_ZONE);
        DailyMix mix = dailyMixRepository.findByUserIdAndMixDate(user.getId(), today)
                .orElseGet(() -> createDailyMix(user, today));
        return response(mix);
    }

    private DailyMix createDailyMix(User user, LocalDate today) {
        List<Song> catalog = songRepository.findAll().stream()
                .filter(song -> song.getSourceId() != null && !song.getSourceId().isBlank())
                .filter(song -> musicService.hasPrecachedAudio(song.getSourceId()))
                .toList();
        List<PlaybackPreference> preferences =
                preferenceRepository.findByUserIdOrderByLastListenedAtDesc(user.getId());
        Set<Long> libraryIds = user.getDownloadedSongs().stream()
                .map(Song::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Set<Long> historyIds = preferences.stream()
                .map(item -> item.getSong().getId())
                .collect(Collectors.toSet());
        Set<Long> anchors = new HashSet<>(libraryIds);
        anchors.addAll(historyIds);

        Map<String, Double> artistAffinity = new HashMap<>();
        Map<Long, Double> score = new HashMap<>();
        preferences.forEach(preference -> {
            Song song = preference.getSong();
            double strength = Math.log1p(preference.getPlayCount()) * 4.0
                    + Math.log1p(preference.getCompletedCount()) * 5.0
                    + Math.min(4.0, preference.getListenedSeconds() / 1800.0);
            score.merge(song.getId(), strength * 1.5, Double::sum);
            artistAffinity.merge(normalizeArtist(song.getArtist()), strength, Double::sum);
        });
        user.getDownloadedSongs().forEach(song -> {
            score.merge(song.getId(), 5.0, Double::sum);
            artistAffinity.merge(normalizeArtist(song.getArtist()), 3.0, Double::sum);
        });

        List<Song> popular = songRepository.findMostDownloadedSongs();
        for (int index = 0; index < popular.size(); index++) {
            score.merge(popular.get(index).getId(), 3.0 * (popular.size() - index) / popular.size(), Double::sum);
        }

        for (Playlist playlist : playlistRepository.findAll()) {
            List<Song> songs = new ArrayList<>(playlist.getSongs());
            long anchorMatches = songs.stream().filter(song -> anchors.contains(song.getId())).count();
            double artistMatches = songs.stream()
                    .map(song -> artistAffinity.getOrDefault(normalizeArtist(song.getArtist()), 0.0))
                    .filter(value -> value > 0)
                    .mapToDouble(value -> Math.min(2.0, value / 5.0))
                    .sum();
            double contextStrength = Math.min(8.0, anchorMatches * 2.5 + artistMatches);
            if (contextStrength <= 0) continue;
            songs.forEach(song -> score.merge(song.getId(), contextStrength, Double::sum));
        }

        Set<Long> previousMixIds = dailyMixRepository
                .findTopByUserIdAndMixDateBeforeOrderByMixDateDesc(user.getId(), today)
                .map(previous -> previous.getSongs().stream().map(Song::getId).collect(Collectors.toSet()))
                .orElseGet(Set::of);
        long seed = 31L * user.getUsername().toLowerCase(Locale.ROOT).hashCode() + today.toEpochDay();
        Random random = new Random(seed);
        Map<Long, Double> dailyJitter = catalog.stream().collect(Collectors.toMap(
                Song::getId,
                ignored -> random.nextDouble() * 3.5
        ));

        List<Song> ranked = new ArrayList<>(catalog);
        ranked.sort(Comparator
                .comparingDouble((Song song) -> {
                    double affinity = artistAffinity.getOrDefault(normalizeArtist(song.getArtist()), 0.0);
                    double value = score.getOrDefault(song.getId(), 0.0)
                            + Math.min(14.0, affinity * 0.75)
                            + dailyJitter.getOrDefault(song.getId(), 0.0);
                    if (previousMixIds.contains(song.getId())) value *= 0.62;
                    return value;
                })
                .reversed()
                .thenComparing(Song::getId));

        List<Song> selected = selectWithArtistDiversity(ranked, DAILY_SIZE);
        DailyMix mix = new DailyMix();
        mix.setUser(user);
        mix.setMixDate(today);
        mix.setName(mixName(user, today));
        mix.setGeneratedAt(LocalDateTime.now(APP_ZONE));
        mix.setSongs(selected);
        return dailyMixRepository.save(mix);
    }

    private List<Song> selectWithArtistDiversity(List<Song> ranked, int limit) {
        List<Song> selected = new ArrayList<>();
        Set<Long> selectedIds = new HashSet<>();
        Map<String, Integer> artistCounts = new HashMap<>();
        for (Song song : ranked) {
            String artist = normalizeArtist(song.getArtist());
            if (artistCounts.getOrDefault(artist, 0) >= 7) continue;
            selected.add(song);
            selectedIds.add(song.getId());
            artistCounts.merge(artist, 1, Integer::sum);
            if (selected.size() >= limit) return selected;
        }
        for (Song song : ranked) {
            if (selectedIds.add(song.getId())) selected.add(song);
            if (selected.size() >= limit) break;
        }
        return selected;
    }

    private Optional<Song> resolveSong(PlaybackReportRequest request) {
        if (request.songId() != null) {
            Optional<Song> byId = songRepository.findById(request.songId());
            if (byId.isPresent()) return byId;
        }
        String sourceId = request.sourceId() == null ? "" : request.sourceId().trim();
        return sourceId.isEmpty() ? Optional.empty() : songRepository.findBySourceId(sourceId);
    }

    private User getUser(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Usuário não encontrado."));
    }

    private DailyMixResponse response(DailyMix mix) {
        return new DailyMixResponse(
                "daily-" + mix.getMixDate(),
                mix.getName(),
                "100 músicas escolhidas a partir do que você ouve, salva e costuma terminar.",
                mix.getMixDate(),
                mix.getSongs()
        );
    }

    private String mixName(User user, LocalDate date) {
        int index = Math.floorMod(user.getUsername().hashCode() + date.getDayOfYear(), MIX_NAMES.size());
        return MIX_NAMES.get(index);
    }

    private String normalizeArtist(String value) {
        String normalized = Normalizer.normalize(Objects.toString(value, ""), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("\\s+(feat|ft)\\.?\\s+.*$", "")
                .trim();
        return normalized.isBlank() ? "artista desconhecido" : normalized;
    }
}
