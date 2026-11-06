import TrackPlayer from '@rntp/player';
import { Platform } from 'react-native';

// Only player gain changes here, never Android's system/headphone volume.
export function applyPlaybackVolume(requested = 1) {
  TrackPlayer.setVolume(Platform.OS === 'android' ? 1 : Math.max(0, Math.min(1, Number(requested) || 0)));
}

export function getPlaybackVolume() {
  if (Platform.OS === 'android') return 1;
  const value = Number(TrackPlayer.getVolume());
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}
