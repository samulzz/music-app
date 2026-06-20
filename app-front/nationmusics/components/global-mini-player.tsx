import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TrackPlayer, { Event, State, usePlaybackState, useProgress, useTrackPlayerEvents } from 'react-native-track-player';

import { setupPlayer, skipToRelative } from '../services/playerSetup';
import { useActiveTrackFallback } from '../hooks/use-active-track-fallback';

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

type Props = {
  bottomOffset?: number;
};

export default function GlobalMiniPlayer({ bottomOffset = 64 }: Props) {
  const activeTrack = useActiveTrackFallback();
  const playbackState = usePlaybackState();
  const progress = useProgress(700);
  const [busy, setBusy] = useState(false);
  const [playWhenReady, setPlayWhenReady] = useState<boolean | null>(null);

  useEffect(() => {
    TrackPlayer.getPlayWhenReady()
      .then((value) => setPlayWhenReady(value))
      .catch(() => {});
  }, []);

  useTrackPlayerEvents([Event.PlaybackPlayWhenReadyChanged, Event.PlaybackState], (event) => {
    if (event.type === Event.PlaybackPlayWhenReadyChanged) {
      setPlayWhenReady(event.playWhenReady);
    }
  });

  if (!activeTrack) return null;

  const shouldShowPause = playWhenReady ?? [State.Playing, State.Buffering, State.Loading].includes(playbackState.state as State);
  const progressRatio = progress.duration > 0
    ? Math.min(progress.position / progress.duration, 1)
    : 0;

  const togglePlayPause = async () => {
    if (busy) return;

    setBusy(true);
    try {
      const ready = await TrackPlayer.getPlayWhenReady();
      if (ready) {
        await TrackPlayer.setPlayWhenReady(false);
        await TrackPlayer.pause();
      } else {
        await setupPlayer();
        await TrackPlayer.setPlayWhenReady(true);
        await TrackPlayer.play();
      }
    } finally {
      setBusy(false);
    }
  };

  const prev = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await skipToRelative(-1);
    } finally {
      setBusy(false);
    }
  };

  const next = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await skipToRelative(1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.player, { bottom: bottomOffset }]}>
      <View style={styles.playerInfo}>
        {typeof activeTrack.artwork === 'string' && activeTrack.artwork ? (
          <Image source={{ uri: activeTrack.artwork }} style={styles.playerCover} />
        ) : (
          <View style={[styles.playerCover, styles.playerCoverPlaceholder]}>
            <Ionicons name="musical-notes" size={18} color="#1db954" />
          </View>
        )}

        <View style={styles.playerMeta}>
          <Text style={styles.playerTitle} numberOfLines={1}>{activeTrack.title ?? 'Reproduzindo'}</Text>
          <Text style={styles.playerArtist} numberOfLines={1}>{activeTrack.artist ?? ''}</Text>
        </View>
      </View>

      <View style={styles.playerControls}>
        <TouchableOpacity onPress={() => { prev().catch(() => {}); }} style={styles.ctrlBtn} disabled={busy}>
          <Ionicons name="play-skip-back" size={22} color="#ccc" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.playBtn} onPress={() => { togglePlayPause().catch(() => {}); }} disabled={busy}>
          {busy
            ? <ActivityIndicator size="small" color="#121212" />
            : <Ionicons name={shouldShowPause ? 'pause' : 'play'} size={22} color="#121212" style={!shouldShowPause ? { marginLeft: 2 } : {}} />
          }
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { next().catch(() => {}); }} style={styles.ctrlBtn} disabled={busy}>
          <Ionicons name="play-skip-forward" size={22} color="#ccc" />
        </TouchableOpacity>
      </View>

      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressRatio * 100}%` }]} />
        </View>
        <View style={styles.progressLabels}>
          <Text style={styles.progressText}>{formatTime(progress.position)}</Text>
          <Text style={styles.progressText}>{formatTime(progress.duration)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  player: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 60,
    elevation: 24,
    backgroundColor: '#161616',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  playerInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  playerCover: { width: 40, height: 40, borderRadius: 8, marginRight: 10 },
  playerCoverPlaceholder: {
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#2c2c2c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerMeta: { flex: 1 },
  playerTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  playerArtist: { color: '#8a8a8a', fontSize: 12, marginTop: 2 },

  playerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    gap: 18,
  },
  ctrlBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1db954',
    alignItems: 'center',
    justifyContent: 'center',
  },

  progressWrap: { gap: 4 },
  progressTrack: {
    height: 4,
    borderRadius: 3,
    backgroundColor: '#2a2a2a',
    overflow: 'hidden',
  },
  progressFill: { height: 4, backgroundColor: '#1db954' },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressText: { color: '#7a7a7a', fontSize: 10 },
});