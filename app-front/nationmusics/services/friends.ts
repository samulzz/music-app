import type { JamSong } from './jam';
import { apiRequest } from './api';

export type FriendPresence = {
  username: string;
  online: boolean;
  listening: boolean;
  lastSeenAt: number;
  lastListenedAt?: number;
  song?: JamSong | null;
  positionSeconds: number;
  activeJamCode?: string;
  avatarIcon?: string;
  activityHidden?: boolean;
};

export type FriendUser = {
  username: string;
  relationship: 'none' | 'friends' | 'pending_incoming' | 'pending_outgoing';
  requestId?: number | null;
  requestedByMe: boolean;
  presence: FriendPresence;
};

export type FriendRequests = {
  incoming: FriendUser[];
  outgoing: FriendUser[];
};

export type FriendPresencePayload = {
  song?: JamSong | null;
  playing: boolean;
  positionSeconds: number;
  activeJamCode?: string;
};

export function listFriends() {
  return apiRequest<FriendUser[]>('/friends');
}

export function searchFriends(query: string) {
  return apiRequest<FriendUser[]>(`/friends/search?q=${encodeURIComponent(query)}`);
}

export function listFriendRequests() {
  return apiRequest<FriendRequests>('/friends/requests');
}

export function sendFriendRequest(username: string) {
  return apiRequest<FriendUser>('/friends/request', {
    method: 'POST',
    json: true,
    body: JSON.stringify({ username }),
  });
}

export function acceptFriendRequest(requestId: number) {
  return apiRequest<FriendUser>(`/friends/requests/${encodeURIComponent(requestId)}/accept`, {
    method: 'POST',
  });
}

export function declineFriendRequest(requestId: number) {
  return apiRequest<void>(`/friends/requests/${encodeURIComponent(requestId)}`, {
    method: 'DELETE',
  });
}

export function removeFriend(username: string) {
  return apiRequest<void>(`/friends/${encodeURIComponent(username)}`, {
    method: 'DELETE',
  });
}

export function updateFriendPresence(payload: FriendPresencePayload) {
  return apiRequest<FriendPresence>('/friends/presence', {
    method: 'POST',
    json: true,
    body: JSON.stringify(payload),
  });
}

export function clearFriendPresence() {
  return apiRequest<void>('/friends/presence', {
    method: 'DELETE',
  });
}
