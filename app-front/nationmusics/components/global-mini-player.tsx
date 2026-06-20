import { memo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useActiveMediaItem,
  useIsPlaying,
  useProgress,
} from '@rntp/player';

import { playNext, playPrevious, togglePlayback } from '../services/player';

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const totalSeconds = Math.floor(value);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

type Props = {
  bottomOffset?: number;
};

function GlobalMiniPlayer({ bottomOffset = 64 }: Props) {
  const activeTrack = useActiveMediaItem();
  const isPlaying = useIsPlaying();
  const progress = useProgress(0.75);
  const [busy, setBusy] = useState(false);

  if (!activeTrack) return null;

  const progressRatio = progress.duration > 0
    ? Math.min(progress.position / progress.duration, 1)
    : 0;

  const run = (action: () => void) => {
    if (busy) return;
    setBusy(true);
    try {
      action();
    } finally {
      setTimeout(() => setBusy(false), 180);
    }
  };

  const artwork = typeof activeTrack.artworkUrl === 'string' ? activeTrack.artworkUrl : '';

  return (
    <View style={[styles.player, { bottom: bottomOffset }]}>
      <View style={styles.mainRow}>
        {artwork ? (
          <Image source={{ uri: artwork }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]}>
            <Ionicons name="musical-notes" size={18} color="#1db954" />
          </View>
        )}

        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={1}>{activeTrack.title || 'Reproduzindo'}</Text>
          <Text style={styles.artist} numberOfLines={1}>{activeTrack.artist || ''}</Text>
        </View>

        <TouchableOpacity
          accessibilityLabel="Música anterior"
          onPress={() => run(playPrevious)}
          style={styles.control}
          disabled={busy}
        >
          <Ionicons name="play-skip-back" size={21} color="#d4d4d4" />
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityLabel={isPlaying ? 'Pausar' : 'Reproduzir'}
          onPress={() => run(togglePlayback)}
          style={styles.playButton}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#121212" />
          ) : (
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={21} color="#121212" />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityLabel="Próxima música"
          onPress={() => run(playNext)}
          style={styles.control}
          disabled={busy}
        >
          <Ionicons name="play-skip-forward" size={21} color="#d4d4d4" />
        </TouchableOpacity>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressRatio * 100}%` }]} />
      </View>
      <View style={styles.progressLabels}>
        <Text style={styles.progressText}>{formatTime(progress.position)}</Text>
        <Text style={styles.progressText}>{formatTime(progress.duration)}</Text>
      </View>
    </View>
  );
}

export default memo(GlobalMiniPlayer);

const styles = StyleSheet.create({
  player: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 60,
    elevation: 24,
    backgroundColor: '#181818',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#303030',
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 7,
  },
  mainRow: { flexDirection: 'row', alignItems: 'center' },
  cover: { width: 42, height: 42, borderRadius: 8, marginRight: 10 },
  coverPlaceholder: { backgroundColor: '#242424', alignItems: 'center', justifyContent: 'center' },
  meta: { flex: 1, marginRight: 6 },
  title: { color: '#fff', fontSize: 13, fontWeight: '700' },
  artist: { color: '#999', fontSize: 11, marginTop: 2 },
  control: { padding: 8 },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginHorizontal: 2,
    backgroundColor: '#1db954',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 3,
    marginTop: 7,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: '#333',
  },
  progressFill: { height: 3, backgroundColor: '#1db954' },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  progressText: { color: '#777', fontSize: 9 },
});
