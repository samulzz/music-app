import { apiRequest } from './api';
import type { FriendPresence } from './friends';

export type UserProfile = {
  username: string;
  avatarIcon: string;
  showOnlineStatus: boolean;
  showListeningActivity: boolean;
  showLastSeen: boolean;
  showActiveJam: boolean;
  presence?: FriendPresence;
};

export type UserProfileUpdate = Partial<Pick<
  UserProfile,
  'avatarIcon' | 'showOnlineStatus' | 'showListeningActivity' | 'showLastSeen' | 'showActiveJam'
>>;

export function getUserProfile() {
  return apiRequest<UserProfile>('/user/profile');
}

export function updateUserProfile(update: UserProfileUpdate) {
  return apiRequest<UserProfile>('/user/profile', {
    method: 'PUT',
    json: true,
    body: JSON.stringify(update),
  });
}
