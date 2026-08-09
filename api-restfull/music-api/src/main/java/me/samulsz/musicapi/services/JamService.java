package me.samulsz.musicapi.services;

import me.samulsz.musicapi.dto.JamParticipantResponse;
import me.samulsz.musicapi.dto.JamPermissionsResponse;
import me.samulsz.musicapi.dto.JamPlaybackState;
import me.samulsz.musicapi.dto.JamSessionResponse;
import me.samulsz.musicapi.dto.JamSettingsRequest;
import me.samulsz.musicapi.dto.JamSongDto;
import me.samulsz.musicapi.dto.JamStateRequest;
import me.samulsz.musicapi.models.JamParticipant;
import me.samulsz.musicapi.models.JamQueueItem;
import me.samulsz.musicapi.models.JamRoom;
import me.samulsz.musicapi.models.User;
import me.samulsz.musicapi.repositories.JamRoomRepository;
import me.samulsz.musicapi.repositories.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

@Service
@Transactional
public class JamService {

    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final Duration ROOM_TTL = Duration.ofDays(7);
    private final SecureRandom random = new SecureRandom();
    private final JamRoomRepository jamRoomRepository;
    private final UserRepository userRepository;

    public JamService(JamRoomRepository jamRoomRepository, UserRepository userRepository) {
        this.jamRoomRepository = jamRoomRepository;
        this.userRepository = userRepository;
    }

    public JamSessionResponse create(String username, JamStateRequest request) {
        cleanupExpiredRooms();
        User owner = getUser(username);
        JamPlaybackState state = toPlaybackState(request, 1);
        JamRoom room = new JamRoom();
        room.setCode(createCode());
        room.setOwner(owner);
        room.setAllowParticipantControl(false);
        room.setAllowParticipantQueue(true);
        room.setSyncVolume(false);
        writeState(room, state);
        room.setVolumeLevel(clampVolume(request == null ? null : request.volumeLevel(), 1));
        addOrReactivateParticipant(room, owner);
        addSongToQueue(room, state.song());
        return toResponse(jamRoomRepository.save(room), username);
    }

    public JamSessionResponse join(String username, String code) {
        JamRoom room = findRoom(code);
        addOrReactivateParticipant(room, getUser(username));
        touch(room);
        return toResponse(jamRoomRepository.save(room), username);
    }

    @Transactional(readOnly = true)
    public JamSessionResponse get(String username, String code) {
        JamRoom room = findRoom(code);
        return toResponse(room, username);
    }

    public JamSessionResponse updateState(String username, String code, JamStateRequest request) {
        JamRoom room = findRoom(code);
        ensureControl(room, username);
        JamPlaybackState state = toPlaybackState(request, room.getVolumeLevel());
        writeState(room, state);
        addSongToQueue(room, state.song());
        addOrReactivateParticipant(room, getUser(username));
        touch(room);
        return toResponse(jamRoomRepository.save(room), username);
    }

    public JamSessionResponse updateSettings(String username, String code, JamSettingsRequest request) {
        JamRoom room = findRoom(code);
        ensureOwner(room, username);
        if (request != null) {
            if (request.allowParticipantControl() != null) {
                room.setAllowParticipantControl(request.allowParticipantControl());
            }
            if (request.allowParticipantQueue() != null) {
                room.setAllowParticipantQueue(request.allowParticipantQueue());
            }
            if (request.syncVolume() != null) {
                room.setSyncVolume(request.syncVolume());
            }
            if (request.volumeLevel() != null) {
                room.setVolumeLevel(clampVolume(request.volumeLevel(), room.getVolumeLevel()));
            }
        }
        addOrReactivateParticipant(room, getUser(username));
        touch(room);
        return toResponse(jamRoomRepository.save(room), username);
    }

    public JamSessionResponse addToQueue(String username, String code, JamStateRequest request) {
        JamRoom room = findRoom(code);
        if (!canQueue(room, username)) {
            throw new IllegalArgumentException("Voce nao tem permissao para alterar a fila desta JAM.");
        }
        JamSongDto song = normalizeSong(request == null ? null : request.song());
        addSongToQueue(room, song);
        addOrReactivateParticipant(room, getUser(username));
        touch(room);
        return toResponse(jamRoomRepository.save(room), username);
    }

    public void leave(String username, String code) {
        JamRoom room = findRoom(code);
        room.getParticipants().stream()
                .filter((participant) -> participant.getUser().getUsername().equalsIgnoreCase(username))
                .findFirst()
                .ifPresent((participant) -> participant.setActive(false));
        touch(room);
        jamRoomRepository.save(room);
    }

    private JamRoom findRoom(String code) {
        cleanupExpiredRooms();
        return jamRoomRepository.findByCodeAndActiveTrue(normalizeCode(code))
                .orElseThrow(() -> new IllegalArgumentException("JAM expirada ou inexistente."));
    }

    private User getUser(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Usuario nao encontrado."));
    }

    private void ensureOwner(JamRoom room, String username) {
        if (!room.getOwner().getUsername().equalsIgnoreCase(username)) {
            throw new IllegalArgumentException("Somente o dono da JAM pode alterar essas configuracoes.");
        }
    }

    private void ensureControl(JamRoom room, String username) {
        if (!canControl(room, username)) {
            throw new IllegalArgumentException("O dono da JAM nao permitiu que participantes controlem a musica.");
        }
    }

    private boolean canControl(JamRoom room, String username) {
        return room.getOwner().getUsername().equalsIgnoreCase(username) || room.isAllowParticipantControl();
    }

    private boolean canQueue(JamRoom room, String username) {
        return canControl(room, username) || room.isAllowParticipantQueue();
    }

    private void addOrReactivateParticipant(JamRoom room, User user) {
        JamParticipant participant = room.getParticipants().stream()
                .filter((candidate) -> candidate.getUser().getUsername().equalsIgnoreCase(user.getUsername()))
                .findFirst()
                .orElseGet(() -> {
                    JamParticipant next = new JamParticipant();
                    next.setRoom(room);
                    next.setUser(user);
                    room.getParticipants().add(next);
                    return next;
                });
        participant.setActive(true);
    }

    private void writeState(JamRoom room, JamPlaybackState state) {
        JamSongDto song = state.song();
        room.setSongId(trim(song.id()));
        room.setSongSourceId(trim(song.sourceId()));
        room.setSongTitle(trim(song.title()));
        room.setSongArtist(trim(song.artist()));
        room.setSongArtworkUrl(trim(song.artworkUrl()));
        room.setSongRemoteUrl(trim(song.remoteUrl()));
        room.setPositionSeconds(Math.max(0, state.positionSeconds()));
        room.setPlaying(state.playing());
        room.setStateUpdatedAt(state.updatedAt());
        room.setVolumeLevel(clampVolume(state.volumeLevel(), room.getVolumeLevel()));
    }

    private JamPlaybackState readState(JamRoom room) {
        return new JamPlaybackState(
                readSong(
                        room.getSongId(),
                        room.getSongSourceId(),
                        room.getSongTitle(),
                        room.getSongArtist(),
                        room.getSongArtworkUrl(),
                        room.getSongRemoteUrl()
                ),
                Math.max(0, room.getPositionSeconds()),
                room.isPlaying(),
                room.getStateUpdatedAt(),
                clampVolume(room.getVolumeLevel(), 1)
        );
    }

    private JamPlaybackState toPlaybackState(JamStateRequest request, double fallbackVolume) {
        if (request == null || request.song() == null) {
            throw new IllegalArgumentException("Informe uma musica para iniciar a JAM.");
        }
        return new JamPlaybackState(
                normalizeSong(request.song()),
                request.positionSeconds() == null ? 0 : Math.max(0, request.positionSeconds()),
                Boolean.TRUE.equals(request.playing()),
                System.currentTimeMillis(),
                clampVolume(request.volumeLevel(), fallbackVolume)
        );
    }

    private JamSongDto normalizeSong(JamSongDto song) {
        if (song == null) {
            throw new IllegalArgumentException("Informe uma musica para a JAM.");
        }
        String sourceId = trim(song.sourceId());
        String id = trim(song.id());
        if (sourceId.isEmpty() && id.isEmpty()) {
            throw new IllegalArgumentException("Esta musica nao tem identificador para tocar em outros aparelhos.");
        }
        return new JamSongDto(
                id.isEmpty() ? sourceId : id,
                sourceId.isEmpty() ? id : sourceId,
                trim(song.title()).isEmpty() ? "Musica" : trim(song.title()),
                trim(song.artist()).isEmpty() ? "Artista desconhecido" : trim(song.artist()),
                trim(song.artworkUrl()),
                trim(song.remoteUrl())
        );
    }

    private JamSongDto readSong(
            String id,
            String sourceId,
            String title,
            String artist,
            String artworkUrl,
            String remoteUrl
    ) {
        String normalizedId = trim(id);
        String normalizedSourceId = trim(sourceId);
        return new JamSongDto(
                normalizedId.isEmpty() ? normalizedSourceId : normalizedId,
                normalizedSourceId.isEmpty() ? normalizedId : normalizedSourceId,
                trim(title).isEmpty() ? "Musica" : trim(title),
                trim(artist).isEmpty() ? "Artista desconhecido" : trim(artist),
                trim(artworkUrl),
                trim(remoteUrl)
        );
    }

    private void addSongToQueue(JamRoom room, JamSongDto song) {
        boolean alreadyQueued = room.getQueueItems().stream().anyMatch((item) -> {
            String left = trim(item.getSongSourceId()).isEmpty() ? trim(item.getSongId()) : trim(item.getSongSourceId());
            String right = trim(song.sourceId()).isEmpty() ? trim(song.id()) : trim(song.sourceId());
            return !left.isEmpty() && left.equals(right);
        });
        if (alreadyQueued) return;

        JamQueueItem item = new JamQueueItem();
        item.setRoom(room);
        item.setPositionIndex(room.getQueueItems().size());
        item.setSongId(trim(song.id()));
        item.setSongSourceId(trim(song.sourceId()));
        item.setSongTitle(trim(song.title()));
        item.setSongArtist(trim(song.artist()));
        item.setSongArtworkUrl(trim(song.artworkUrl()));
        item.setSongRemoteUrl(trim(song.remoteUrl()));
        room.getQueueItems().add(item);
    }

    private JamSessionResponse toResponse(JamRoom room, String viewerUsername) {
        List<JamParticipantResponse> participantDetails = room.getParticipants().stream()
                .sorted(Comparator
                        .comparing((JamParticipant participant) -> !participant.getUser().getUsername().equalsIgnoreCase(room.getOwner().getUsername()))
                        .thenComparing((participant) -> participant.getUser().getUsername(), String.CASE_INSENSITIVE_ORDER))
                .map((participant) -> new JamParticipantResponse(
                        participant.getUser().getUsername(),
                        participant.getUser().getUsername().equalsIgnoreCase(room.getOwner().getUsername()),
                        participant.isActive(),
                        participant.getJoinedAt(),
                        participant.getLastSeenAt()
                ))
                .toList();
        List<String> activeParticipants = participantDetails.stream()
                .filter(JamParticipantResponse::active)
                .map(JamParticipantResponse::username)
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .toList();
        List<JamSongDto> queue = room.getQueueItems().stream()
                .sorted(Comparator.comparingInt(JamQueueItem::getPositionIndex))
                .map((item) -> readSong(
                        item.getSongId(),
                        item.getSongSourceId(),
                        item.getSongTitle(),
                        item.getSongArtist(),
                        item.getSongArtworkUrl(),
                        item.getSongRemoteUrl()
                ))
                .toList();
        boolean owner = room.getOwner().getUsername().equalsIgnoreCase(viewerUsername);
        boolean canControl = canControl(room, viewerUsername);
        boolean canQueue = canQueue(room, viewerUsername);
        return new JamSessionResponse(
                room.getCode(),
                "nationmusics:///jam/" + room.getCode(),
                room.getOwner().getUsername(),
                activeParticipants,
                readState(room),
                System.currentTimeMillis(),
                owner,
                canControl,
                owner,
                canQueue,
                new JamPermissionsResponse(
                        room.isAllowParticipantControl(),
                        room.isAllowParticipantQueue(),
                        room.isSyncVolume()
                ),
                participantDetails,
                queue,
                clampVolume(room.getVolumeLevel(), 1)
        );
    }

    private String createCode() {
        for (int attempt = 0; attempt < 20; attempt += 1) {
            StringBuilder builder = new StringBuilder();
            for (int i = 0; i < 6; i += 1) {
                builder.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
            }
            String code = builder.toString();
            if (!jamRoomRepository.existsByCode(code)) return code;
        }
        throw new IllegalStateException("Nao foi possivel criar um codigo de JAM agora.");
    }

    private void touch(JamRoom room) {
        room.setLastTouchedAt(System.currentTimeMillis());
    }

    private double clampVolume(Double value, double fallback) {
        double volume = value == null || !Double.isFinite(value) ? fallback : value;
        return Math.max(0, Math.min(1, volume));
    }

    private String normalizeCode(String code) {
        return trim(code).toUpperCase(Locale.ROOT);
    }

    private String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private void cleanupExpiredRooms() {
        long cutoff = System.currentTimeMillis() - ROOM_TTL.toMillis();
        jamRoomRepository.findAll().stream()
                .filter((room) -> room.isActive() && room.getLastTouchedAt() < cutoff)
                .forEach((room) -> room.setActive(false));
    }
}
