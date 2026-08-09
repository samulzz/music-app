package me.samulsz.musicapi.services;

import me.samulsz.musicapi.dto.FriendPresenceRequest;
import me.samulsz.musicapi.dto.FriendPresenceResponse;
import me.samulsz.musicapi.dto.JamSongDto;
import me.samulsz.musicapi.dto.UserProfileResponse;
import me.samulsz.musicapi.dto.UserProfileUpdateRequest;
import me.samulsz.musicapi.models.User;
import me.samulsz.musicapi.models.UserPresence;
import me.samulsz.musicapi.repositories.UserPresenceRepository;
import me.samulsz.musicapi.repositories.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.Set;

@Service
@Transactional
public class FriendPresenceService {

    private static final long ONLINE_TTL_MS = 5 * 60_000;
    private static final String DEFAULT_AVATAR_ICON = "person";
    private static final Set<String> ALLOWED_AVATAR_ICONS = Set.of(
            "person",
            "musical-note",
            "headset",
            "radio",
            "star",
            "heart",
            "flame",
            "moon",
            "planet",
            "sparkles",
            "disc",
            "flash"
    );

    private final UserRepository userRepository;
    private final UserPresenceRepository presenceRepository;

    public FriendPresenceService(UserRepository userRepository, UserPresenceRepository presenceRepository) {
        this.userRepository = userRepository;
        this.presenceRepository = presenceRepository;
    }

    public FriendPresenceResponse update(String username, FriendPresenceRequest request) {
        UserPresence presence = getOrCreate(username);
        long now = System.currentTimeMillis();
        JamSongDto song = request == null ? null : normalizeSong(request.song());
        boolean playing = request != null && Boolean.TRUE.equals(request.playing()) && song != null;

        presence.setOnline(true);
        presence.setLastSeenAt(now);
        presence.setPlaying(playing);
        presence.setPositionSeconds(request == null || request.positionSeconds() == null
                ? 0
                : Math.max(0, request.positionSeconds()));
        presence.setActiveJamCode(normalizeJamCode(request == null ? "" : request.activeJamCode()));
        writeSong(presence, song);
        if (playing) {
            presence.setLastListenedAt(now);
        }

        return toFullResponse(presenceRepository.save(presence));
    }

    public void markOffline(String username) {
        UserPresence presence = getOrCreate(username);
        presence.setOnline(false);
        presence.setPlaying(false);
        presence.setLastSeenAt(System.currentTimeMillis());
        presenceRepository.save(presence);
    }

    @Transactional(readOnly = true)
    public FriendPresenceResponse getPresence(String username) {
        return presenceRepository.findByUserUsername(username)
                .map(this::toFullResponse)
                .orElseGet(() -> emptyResponse(username, false));
    }

    @Transactional(readOnly = true)
    public FriendPresenceResponse getPresenceForViewer(String viewerUsername, String targetUsername, boolean friends) {
        return presenceRepository.findByUserUsername(targetUsername)
                .map((presence) -> toViewerResponse(presence, viewerUsername, friends))
                .orElseGet(() -> emptyResponse(targetUsername, !friends));
    }

    public UserProfileResponse getProfile(String username) {
        return toProfileResponse(getOrCreate(username));
    }

    public UserProfileResponse updateProfile(String username, UserProfileUpdateRequest request) {
        UserPresence presence = getOrCreate(username);
        if (request != null) {
            if (request.avatarIcon() != null) {
                presence.setAvatarIcon(normalizeAvatarIcon(request.avatarIcon()));
            }
            if (request.showOnlineStatus() != null) {
                presence.setShowOnlineStatus(request.showOnlineStatus());
            }
            if (request.showListeningActivity() != null) {
                presence.setShowListeningActivity(request.showListeningActivity());
            }
            if (request.showLastSeen() != null) {
                presence.setShowLastSeen(request.showLastSeen());
            }
            if (request.showActiveJam() != null) {
                presence.setShowActiveJam(request.showActiveJam());
            }
        }
        return toProfileResponse(presenceRepository.save(presence));
    }

    private UserProfileResponse toProfileResponse(UserPresence presence) {
        return new UserProfileResponse(
                presence.getUser().getUsername(),
                normalizeAvatarIcon(presence.getAvatarIcon()),
                presence.isShowOnlineStatus(),
                presence.isShowListeningActivity(),
                presence.isShowLastSeen(),
                presence.isShowActiveJam(),
                toFullResponse(presence)
        );
    }

    private FriendPresenceResponse toViewerResponse(UserPresence presence, String viewerUsername, boolean friends) {
        boolean ownProfile = presence.getUser().getUsername().equalsIgnoreCase(trim(viewerUsername));
        boolean canSeeSocial = friends || ownProfile;
        if (!canSeeSocial) {
            return emptyResponse(presence.getUser().getUsername(), true, normalizeAvatarIcon(presence.getAvatarIcon()));
        }

        boolean showOnline = presence.isShowOnlineStatus();
        boolean showListening = presence.isShowListeningActivity();
        boolean showLastSeen = presence.isShowLastSeen();
        boolean showJam = presence.isShowActiveJam();
        boolean limitedByPrivacy = !showOnline || !showListening || !showLastSeen || !showJam;
        return toResponse(presence, showOnline, showListening, showLastSeen, showJam, limitedByPrivacy);
    }

    private FriendPresenceResponse toFullResponse(UserPresence presence) {
        return toResponse(presence, true, true, true, true, false);
    }

    private FriendPresenceResponse toResponse(
            UserPresence presence,
            boolean showOnline,
            boolean showListening,
            boolean showLastSeen,
            boolean showJam,
            boolean activityHidden
    ) {
        boolean online = showOnline
                && presence.isOnline()
                && System.currentTimeMillis() - presence.getLastSeenAt() <= ONLINE_TTL_MS;
        JamSongDto song = readSong(presence);
        boolean listening = showListening && online && presence.isPlaying() && song != null;
        return new FriendPresenceResponse(
                presence.getUser().getUsername(),
                online,
                listening,
                showLastSeen ? presence.getLastSeenAt() : 0,
                showListening ? presence.getLastListenedAt() : 0,
                listening ? song : null,
                listening ? presence.getPositionSeconds() : 0,
                online && showJam ? trim(presence.getActiveJamCode()) : "",
                normalizeAvatarIcon(presence.getAvatarIcon()),
                activityHidden
        );
    }

    private FriendPresenceResponse emptyResponse(String username, boolean activityHidden) {
        return emptyResponse(username, activityHidden, DEFAULT_AVATAR_ICON);
    }

    private FriendPresenceResponse emptyResponse(String username, boolean activityHidden, String avatarIcon) {
        return new FriendPresenceResponse(
                username,
                false,
                false,
                0,
                0,
                null,
                0,
                "",
                normalizeAvatarIcon(avatarIcon),
                activityHidden
        );
    }

    private UserPresence getOrCreate(String username) {
        return presenceRepository.findByUserUsername(username)
                .orElseGet(() -> {
                    User user = userRepository.findByUsername(username)
                            .orElseThrow(() -> new IllegalArgumentException("Usuario nao encontrado."));
                    return presenceRepository.save(createDefaultPresence(user));
                });
    }

    private UserPresence createDefaultPresence(User user) {
        UserPresence presence = new UserPresence();
        presence.setUser(user);
        presence.setOnline(false);
        presence.setLastSeenAt(0);
        presence.setLastListenedAt(0);
        presence.setPlaying(false);
        presence.setPositionSeconds(0);
        presence.setActiveJamCode("");
        presence.setAvatarIcon(DEFAULT_AVATAR_ICON);
        presence.setShowOnlineStatus(true);
        presence.setShowListeningActivity(true);
        presence.setShowLastSeen(true);
        presence.setShowActiveJam(true);
        writeSong(presence, null);
        return presence;
    }

    private void writeSong(UserPresence presence, JamSongDto song) {
        if (song == null) {
            presence.setSongId("");
            presence.setSongSourceId("");
            presence.setSongTitle("");
            presence.setSongArtist("");
            presence.setSongArtworkUrl("");
            presence.setSongRemoteUrl("");
            return;
        }
        presence.setSongId(trim(song.id()));
        presence.setSongSourceId(trim(song.sourceId()));
        presence.setSongTitle(trim(song.title()));
        presence.setSongArtist(trim(song.artist()));
        presence.setSongArtworkUrl(trim(song.artworkUrl()));
        presence.setSongRemoteUrl(trim(song.remoteUrl()));
    }

    private JamSongDto readSong(UserPresence presence) {
        String id = trim(presence.getSongId());
        String sourceId = trim(presence.getSongSourceId());
        if (id.isEmpty() && sourceId.isEmpty()) return null;
        return new JamSongDto(
                id.isEmpty() ? sourceId : id,
                sourceId.isEmpty() ? id : sourceId,
                trim(presence.getSongTitle()).isEmpty() ? "Musica" : trim(presence.getSongTitle()),
                trim(presence.getSongArtist()).isEmpty() ? "Artista desconhecido" : trim(presence.getSongArtist()),
                trim(presence.getSongArtworkUrl()),
                trim(presence.getSongRemoteUrl())
        );
    }

    private JamSongDto normalizeSong(JamSongDto song) {
        if (song == null) return null;
        String sourceId = trim(song.sourceId());
        String id = trim(song.id());
        if (sourceId.isEmpty() && id.isEmpty()) return null;
        return new JamSongDto(
                id.isEmpty() ? sourceId : id,
                sourceId.isEmpty() ? id : sourceId,
                trim(song.title()).isEmpty() ? "Musica" : trim(song.title()),
                trim(song.artist()).isEmpty() ? "Artista desconhecido" : trim(song.artist()),
                trim(song.artworkUrl()),
                trim(song.remoteUrl())
        );
    }

    private String normalizeJamCode(String code) {
        return trim(code).toUpperCase(Locale.ROOT);
    }

    private String normalizeAvatarIcon(String icon) {
        String normalized = trim(icon).toLowerCase(Locale.ROOT);
        return ALLOWED_AVATAR_ICONS.contains(normalized) ? normalized : DEFAULT_AVATAR_ICON;
    }

    private String trim(String value) {
        return value == null ? "" : value.trim();
    }
}
