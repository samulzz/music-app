package me.samulsz.musicapi.services;

import me.samulsz.musicapi.dto.DailyMixResponse;
import me.samulsz.musicapi.dto.ConnectSongDto;
import me.samulsz.musicapi.dto.PersonalizedHomeResponse;
import me.samulsz.musicapi.dto.PlaybackReportRequest;
import me.samulsz.musicapi.dto.RecommendationFeedbackRequest;
import me.samulsz.musicapi.models.DailyMix;
import me.samulsz.musicapi.models.AccountPlayback;
import me.samulsz.musicapi.models.PlaybackPreference;
import me.samulsz.musicapi.models.Playlist;
import me.samulsz.musicapi.models.Song;
import me.samulsz.musicapi.models.User;
import me.samulsz.musicapi.repositories.DailyMixRepository;
import me.samulsz.musicapi.repositories.AccountPlaybackRepository;
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
    private final AccountPlaybackRepository accountPlaybackRepository;
    private final MusicService musicService;

    public RecommendationService(
            UserRepository userRepository,
            SongRepository songRepository,
            PlaylistRepository playlistRepository,
            PlaybackPreferenceRepository preferenceRepository,
            DailyMixRepository dailyMixRepository,
            AccountPlaybackRepository accountPlaybackRepository,
            MusicService musicService
    ) {
        this.userRepository = userRepository;
        this.songRepository = songRepository;
        this.playlistRepository = playlistRepository;
        this.preferenceRepository = preferenceRepository;
        this.dailyMixRepository = dailyMixRepository;
        this.accountPlaybackRepository = accountPlaybackRepository;
        this.musicService = musicService;
    }

    @Transactional
    public void reportPlayback(String username, PlaybackReportRequest request) {
        if (request == null) return;
        String outcome = Objects.toString(request.outcome(), "").trim().toUpperCase(Locale.ROOT);
        boolean skipped = "SKIPPED".equals(outcome)
                || (!request.completed() && request.durationSeconds() > 0
                && request.listenedSeconds() <= Math.max(12, request.durationSeconds() * 0.12));
        boolean repeated = "REPEATED".equals(outcome);
        if (!request.completed() && !skipped && !repeated && request.listenedSeconds() < 15) return;
        User user = getUser(username);
        Song song = resolveSong(request).orElse(null);
        if (song == null) return;

        PlaybackPreference preference = preferenceRepository
                .findByUserIdAndSongId(user.getId(), song.getId())
                .orElseGet(PlaybackPreference::new);
        preference.setUser(user);
        preference.setSong(song);
        if (!repeated) preference.setPlayCount(preference.getPlayCount() + 1);
        if (request.completed()) {
            preference.setCompletedCount(preference.getCompletedCount() + 1);
        }
        if (skipped) preference.setSkippedCount(preference.getSkippedCount() + 1);
        if (repeated) preference.setRepeatedCount(preference.getRepeatedCount() + 1);
        long listened = Math.max(0, Math.min(request.listenedSeconds(), 60L * 60L));
        preference.setListenedSeconds(preference.getListenedSeconds() + listened);
        preference.setLastListenedAt(LocalDateTime.now(APP_ZONE));
        preferenceRepository.save(preference);
    }

    @Transactional
    public void setFeedback(String username, RecommendationFeedbackRequest request) {
        if (request == null) throw new IllegalArgumentException("Feedback inválido.");
        User user = getUser(username);
        Song song = resolveSong(request.songId(), request.sourceId())
                .orElseThrow(() -> new IllegalArgumentException("Música não encontrada."));
        PlaybackPreference preference = preferenceRepository.findByUserIdAndSongId(user.getId(), song.getId())
                .orElseGet(PlaybackPreference::new);
        preference.setUser(user);
        preference.setSong(song);
        String action = Objects.toString(request.action(), "").trim().toUpperCase(Locale.ROOT);
        if ("LIKE".equals(action)) {
            preference.setLiked(true);
            preference.setDoNotRecommend(false);
        } else if ("DISLIKE".equals(action)) {
            preference.setLiked(false);
            preference.setDoNotRecommend(true);
        } else if ("CLEAR".equals(action)) {
            preference.setLiked(false);
            preference.setDoNotRecommend(false);
        } else {
            throw new IllegalArgumentException("Ação de feedback inválida.");
        }
        if (preference.getLastListenedAt() == null) preference.setLastListenedAt(LocalDateTime.now(APP_ZONE));
        preferenceRepository.save(preference);
        dailyMixRepository.findByUserIdAndMixDate(user.getId(), LocalDate.now(APP_ZONE)).ifPresent(dailyMixRepository::delete);
    }

    @Transactional
    public synchronized DailyMixResponse getDailyMix(String username) {
        // A linha do usuário serializa a criação. O synchronized sozinho libera antes
        // do commit do proxy transacional e permitia dois INSERTs para a mesma data.
        User user = getUserForUpdate(username);
        LocalDate today = LocalDate.now(APP_ZONE);
        DailyMix mix = dailyMixRepository.findByUserIdAndMixDate(user.getId(), today)
                .orElseGet(() -> createDailyMix(user, today));
        return response(mix);
    }

    @Transactional
    public PersonalizedHomeResponse getPersonalizedHome(String username) {
        User user = getUser(username);
        List<PlaybackPreference> preferences = preferenceRepository.findByUserIdOrderByLastListenedAtDesc(user.getId());
        List<PlaybackPreference> usablePreferences = preferences.stream()
                .filter(item -> item.getSong() != null)
                .filter(item -> item.getSong().getSourceId() != null && !item.getSong().getSourceId().isBlank())
                .filter(item -> musicService.hasPrecachedAudio(item.getSong().getSourceId()))
                .toList();

        List<Song> recentSongs = usablePreferences.stream()
                .map(PlaybackPreference::getSong)
                .filter(distinctById())
                .limit(12)
                .toList();

        Map<String, ArtistAccumulator> artists = new LinkedHashMap<>();
        usablePreferences.forEach(item -> {
            String name = primaryArtist(item.getSong().getArtist());
            String key = normalizeArtist(name);
            long score = Math.max(1, item.getPlayCount()) + item.getCompletedCount() * 2
                    + item.getRepeatedCount() * 3 - item.getSkippedCount() * 2 + (item.isLiked() ? 12 : 0);
            artists.computeIfAbsent(key, ignored -> new ArtistAccumulator(name, item.getSong().getCoverUrl()))
                    .add(score, item.getSong().getCoverUrl());
        });
        List<PersonalizedHomeResponse.ArtistSummary> topArtists = artists.values().stream()
                .sorted(Comparator.comparingLong(ArtistAccumulator::score).reversed())
                .limit(10)
                .map(ArtistAccumulator::response)
                .toList();

        DailyMixResponse daily = getDailyMix(username);
        Set<Long> recentIds = recentSongs.stream().map(Song::getId).collect(Collectors.toSet());
        List<Song> recommended = daily.songs().stream()
                .filter(song -> !recentIds.contains(song.getId()))
                .limit(12)
                .toList();
        if (recommended.size() < 6) recommended = daily.songs().stream().limit(12).toList();

        Set<Long> affinitySongIds = usablePreferences.stream()
                .filter(item -> item.isLiked() || item.getPlayCount() > 1 || item.getCompletedCount() > 0)
                .map(item -> item.getSong().getId())
                .collect(Collectors.toSet());
        Set<String> affinityArtists = topArtists.stream()
                .limit(5)
                .map(item -> normalizeArtist(item.name()))
                .collect(Collectors.toSet());
        List<PersonalizedHomeResponse.PlaylistSummary> relatedPlaylists = playlistRepository
                .findByGlobalPlaylistTrueOrderByIdDesc().stream()
                .map(playlist -> Map.entry(playlist, playlistAffinity(playlist, affinitySongIds, affinityArtists)))
                .sorted(Map.Entry.<Playlist, Integer>comparingByValue().reversed()
                        .thenComparing(entry -> entry.getKey().getId(), Comparator.reverseOrder()))
                .limit(8)
                .map(entry -> new PersonalizedHomeResponse.PlaylistSummary(
                        entry.getKey().getId(), entry.getKey().getName(), entry.getKey().getDescription(), entry.getKey().getIconUrl()))
                .toList();

        PersonalizedHomeResponse.ContinueListening continueListening = accountPlaybackRepository
                .findByUser_Id(user.getId())
                .filter(this::canResume)
                .map(state -> new PersonalizedHomeResponse.ContinueListening(
                        new ConnectSongDto(state.getSongId(), state.getSongSourceId(), state.getSongTitle(), state.getSongArtist(),
                                state.getSongArtworkUrl(), state.getSongRemoteUrl()),
                        state.getPositionSeconds(), state.getDurationSeconds(), state.getStateUpdatedAt(),
                        state.getContextType(), state.getContextId(), state.getContextName()))
                .orElse(null);
        String reason = topArtists.isEmpty()
                ? "Uma seleção para começar a descobrir seu gosto."
                : "Porque você ouve " + topArtists.getFirst().name();
        return new PersonalizedHomeResponse(continueListening, recentSongs, topArtists, recommended,
                relatedPlaylists, reason, daily);
    }

    private boolean canResume(AccountPlayback state) {
        if ((state.getSongId().isBlank() && state.getSongSourceId().isBlank()) || state.getPositionSeconds() < 5) return false;
        return state.getDurationSeconds() <= 0 || state.getPositionSeconds() < state.getDurationSeconds() - 8;
    }

    private int playlistAffinity(Playlist playlist, Set<Long> songIds, Set<String> artists) {
        int score = 0;
        for (Song song : playlist.getSongs()) {
            if (songIds.contains(song.getId())) score += 5;
            if (artists.contains(normalizeArtist(primaryArtist(song.getArtist())))) score += 2;
        }
        return score;
    }

    private java.util.function.Predicate<Song> distinctById() {
        Set<Long> seen = new HashSet<>();
        return song -> song.getId() != null && seen.add(song.getId());
    }

    private String primaryArtist(String value) {
        String artist = Objects.toString(value, "Artista desconhecido").split("(?i)\\s*(?:,|feat\\.?|ft\\.?|&)\\s*")[0].trim();
        return artist.isBlank() ? "Artista desconhecido" : artist;
    }

    private DailyMix createDailyMix(User user, LocalDate today) {
        List<Song> catalog = songRepository.findAll().stream()
                .filter(song -> song.getSourceId() != null && !song.getSourceId().isBlank())
                .filter(song -> musicService.hasPrecachedAudio(song.getSourceId()))
                .toList();
        List<PlaybackPreference> preferences =
                preferenceRepository.findByUserIdOrderByLastListenedAtDesc(user.getId());
        Set<Long> blockedIds = preferences.stream().filter(PlaybackPreference::isDoNotRecommend)
                .map(item -> item.getSong().getId()).collect(Collectors.toSet());
        catalog = catalog.stream().filter(song -> !blockedIds.contains(song.getId())).toList();
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
        Map<String, Double> genreAffinity = new HashMap<>();
        Map<Long, Double> score = new HashMap<>();
        preferences.forEach(preference -> {
            Song song = preference.getSong();
            double strength = Math.log1p(preference.getPlayCount()) * 4.0
                    + Math.log1p(preference.getCompletedCount()) * 5.0
                    + Math.log1p(preference.getRepeatedCount()) * 8.0
                    - Math.log1p(preference.getSkippedCount()) * 7.0
                    + Math.min(4.0, preference.getListenedSeconds() / 1800.0);
            if (preference.isLiked()) strength += 24.0;
            final double affinityStrength = strength;
            score.merge(song.getId(), strength * 1.5, Double::sum);
            artistAffinity.merge(normalizeArtist(song.getArtist()), strength, Double::sum);
            song.getGenres().forEach(genre -> genreAffinity.merge(normalizeGenre(genre), affinityStrength, Double::sum));
        });
        user.getDownloadedSongs().forEach(song -> {
            score.merge(song.getId(), 5.0, Double::sum);
            artistAffinity.merge(normalizeArtist(song.getArtist()), 3.0, Double::sum);
            song.getGenres().forEach(genre -> genreAffinity.merge(normalizeGenre(genre), 3.0, Double::sum));
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
                    double genreScore = song.getGenres().stream()
                            .mapToDouble(genre -> genreAffinity.getOrDefault(normalizeGenre(genre), 0.0))
                            .sum();
                    double value = score.getOrDefault(song.getId(), 0.0)
                            + Math.min(14.0, affinity * 0.75)
                            + Math.min(12.0, genreScore * 0.28)
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
        return resolveSong(request.songId(), request.sourceId());
    }

    private Optional<Song> resolveSong(Long songId, String rawSourceId) {
        if (songId != null) {
            Optional<Song> byId = songRepository.findById(songId);
            if (byId.isPresent()) return byId;
        }
        String sourceId = rawSourceId == null ? "" : rawSourceId.trim();
        return sourceId.isEmpty() ? Optional.empty() : songRepository.findBySourceId(sourceId);
    }

    private User getUser(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Usuário não encontrado."));
    }

    private User getUserForUpdate(String username) {
        return userRepository.findByUsernameForUpdate(username)
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

    private String normalizeGenre(String value) {
        return Normalizer.normalize(Objects.toString(value, ""), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).trim();
    }

    private static class ArtistAccumulator {
        private final String name;
        private String artworkUrl;
        private long score;

        ArtistAccumulator(String name, String artworkUrl) { this.name = name; this.artworkUrl = artworkUrl; }
        void add(long value, String cover) { score += value; if ((artworkUrl == null || artworkUrl.isBlank()) && cover != null) artworkUrl = cover; }
        long score() { return score; }
        PersonalizedHomeResponse.ArtistSummary response() { return new PersonalizedHomeResponse.ArtistSummary(name, artworkUrl, score); }
    }
}
