package me.samulsz.musicapi.services;

import me.samulsz.musicapi.dto.FriendPresenceResponse;
import me.samulsz.musicapi.dto.FriendRequestsResponse;
import me.samulsz.musicapi.dto.FriendUserResponse;
import me.samulsz.musicapi.models.Friendship;
import me.samulsz.musicapi.models.FriendshipStatus;
import me.samulsz.musicapi.models.User;
import me.samulsz.musicapi.repositories.FriendshipRepository;
import me.samulsz.musicapi.repositories.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional
public class FriendService {

    private final FriendshipRepository friendshipRepository;
    private final UserRepository userRepository;
    private final FriendPresenceService presenceService;

    public FriendService(
            FriendshipRepository friendshipRepository,
            UserRepository userRepository,
            FriendPresenceService presenceService
    ) {
        this.friendshipRepository = friendshipRepository;
        this.userRepository = userRepository;
        this.presenceService = presenceService;
    }

    @Transactional(readOnly = true)
    public List<FriendUserResponse> listFriends(String username) {
        return friendshipRepository
                .findByParticipantAndStatus(username, FriendshipStatus.ACCEPTED)
                .stream()
                .map((friendship) -> toFriendResponse(username, otherUsername(friendship, username), friendship))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<FriendUserResponse> search(String username, String query) {
        String normalizedQuery = query == null ? "" : query.trim();
        if (normalizedQuery.length() < 2) return List.of();

        return userRepository.searchUsers(normalizedQuery, username, PageRequest.of(0, 12))
                .stream()
                .map((user) -> toFriendResponse(
                        username,
                        user.getUsername(),
                        friendshipRepository.findBetween(username, user.getUsername()).orElse(null)
                ))
                .toList();
    }

    @Transactional(readOnly = true)
    public FriendRequestsResponse listRequests(String username) {
        List<FriendUserResponse> incoming = friendshipRepository
                .findByAddresseeUsernameAndStatusOrderByUpdatedAtDesc(username, FriendshipStatus.PENDING)
                .stream()
                .map((friendship) -> toFriendResponse(username, friendship.getRequester().getUsername(), friendship))
                .toList();

        List<FriendUserResponse> outgoing = friendshipRepository
                .findByRequesterUsernameAndStatusOrderByUpdatedAtDesc(username, FriendshipStatus.PENDING)
                .stream()
                .map((friendship) -> toFriendResponse(username, friendship.getAddressee().getUsername(), friendship))
                .toList();

        return new FriendRequestsResponse(incoming, outgoing);
    }

    public FriendUserResponse requestFriend(String username, String targetUsername) {
        String normalizedTarget = targetUsername == null ? "" : targetUsername.trim();
        if (normalizedTarget.isEmpty()) {
            throw new IllegalArgumentException("Informe o usuario do amigo.");
        }
        if (username.equalsIgnoreCase(normalizedTarget)) {
            throw new IllegalArgumentException("Voce nao pode adicionar voce mesmo.");
        }

        User requester = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Usuario atual nao encontrado."));
        User addressee = userRepository.findByUsername(normalizedTarget)
                .orElseThrow(() -> new IllegalArgumentException("Usuario nao encontrado."));

        Friendship existing = friendshipRepository.findBetween(username, addressee.getUsername()).orElse(null);
        if (existing != null) {
            if (existing.getStatus() == FriendshipStatus.ACCEPTED) {
                return toFriendResponse(username, otherUsername(existing, username), existing);
            }
            if (existing.getAddressee().getUsername().equals(username)) {
                existing.setStatus(FriendshipStatus.ACCEPTED);
                return toFriendResponse(username, otherUsername(existing, username), friendshipRepository.save(existing));
            }
            throw new IllegalArgumentException("Convite ja enviado para este usuario.");
        }

        Friendship friendship = new Friendship();
        friendship.setRequester(requester);
        friendship.setAddressee(addressee);
        friendship.setStatus(FriendshipStatus.PENDING);
        return toFriendResponse(username, addressee.getUsername(), friendshipRepository.save(friendship));
    }

    public FriendUserResponse accept(String username, Long requestId) {
        Friendship friendship = friendshipRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Convite nao encontrado."));
        if (!friendship.getAddressee().getUsername().equals(username)) {
            throw new IllegalArgumentException("Este convite nao pertence a voce.");
        }

        friendship.setStatus(FriendshipStatus.ACCEPTED);
        return toFriendResponse(username, friendship.getRequester().getUsername(), friendshipRepository.save(friendship));
    }

    public void decline(String username, Long requestId) {
        Friendship friendship = friendshipRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Convite nao encontrado."));
        boolean participant = friendship.getRequester().getUsername().equals(username)
                || friendship.getAddressee().getUsername().equals(username);
        if (!participant) {
            throw new IllegalArgumentException("Este convite nao pertence a voce.");
        }
        friendshipRepository.delete(friendship);
    }

    public void remove(String username, String friendUsername) {
        Friendship friendship = friendshipRepository.findBetween(username, friendUsername)
                .orElseThrow(() -> new IllegalArgumentException("Amigo nao encontrado."));
        boolean participant = friendship.getRequester().getUsername().equals(username)
                || friendship.getAddressee().getUsername().equals(username);
        if (!participant) {
            throw new IllegalArgumentException("Amigo nao encontrado.");
        }
        friendshipRepository.delete(friendship);
    }

    private FriendUserResponse toFriendResponse(String currentUsername, String friendUsername, Friendship friendship) {
        String relationship = "none";
        Long requestId = null;
        boolean requestedByMe = false;

        if (friendship != null) {
            requestId = friendship.getId();
            requestedByMe = friendship.getRequester().getUsername().equals(currentUsername);
            relationship = friendship.getStatus() == FriendshipStatus.ACCEPTED
                    ? "friends"
                    : requestedByMe ? "pending_outgoing" : "pending_incoming";
        }

        boolean friends = "friends".equals(relationship);
        FriendPresenceResponse presence = presenceService.getPresenceForViewer(currentUsername, friendUsername, friends);
        return new FriendUserResponse(friendUsername, relationship, requestId, requestedByMe, presence);
    }

    private String otherUsername(Friendship friendship, String username) {
        return friendship.getRequester().getUsername().equals(username)
                ? friendship.getAddressee().getUsername()
                : friendship.getRequester().getUsername();
    }
}
