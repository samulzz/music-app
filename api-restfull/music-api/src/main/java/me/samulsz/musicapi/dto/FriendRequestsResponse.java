package me.samulsz.musicapi.dto;

import java.util.List;

public record FriendRequestsResponse(
        List<FriendUserResponse> incoming,
        List<FriendUserResponse> outgoing
) {
}
