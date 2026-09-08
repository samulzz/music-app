import { memo, useEffect, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsPlaying, useProgress, type MediaItem } from '@rntp/player';

import { JamControlSheet } from './jam-control-sheet';
import {
  playNext,
  getPlaybackQueue,
  playQueueIndex,
  playPrevious,
  subscribeShuffleEnabled,
  togglePlayback,
  toggleShuffleEnabled,
} from '../services/player';
import { useSyncedActiveMediaItem } from '../services/player-state';
import {
  getConnectDeviceId,
  sendConnectControl,
  subscribeConnectState,
  takeOverConnectPlayback,
  type ConnectState,
} from '../services/connect';
import { sendRecommendationFeedback } from '../services/recommendations';

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const totalSeconds = Math.floor(value);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

type Props = {
  bottomOffset?: number;
};

function GlobalMiniPlayer({ bottomOffset = 64 }: Props) {
  const activeTrack = useSyncedActiveMediaItem();
  const isPlaying = useIsPlaying();
  const progress = useProgress(0.75);
  const [shuffle, setShuffle] = useState(false);
  const [jamSheetVisible, setJamSheetVisible] = useState(false);
  const [connectVisible, setConnectVisible] = useState(false);
  const [queueVisible, setQueueVisible] = useState(false);
  const [queue, setQueue] = useState<MediaItem[]>([]);
  const [liked, setLiked] = useState(false);
  const [connectState, setConnectState] = useState<ConnectState | null>(null);
  const [currentDeviceId, setCurrentDeviceId] = useState('');

  useEffect(() => {
    return subscribeShuffleEnabled(setShuffle);
  }, []);
  useEffect(() => subscribeConnectState(setConnectState), []);
  useEffect(() => {
    void getConnectDeviceId().then(setCurrentDeviceId).catch(() => {});
  }, []);

  const remote = Boolean(connectState?.song && !connectState.currentDeviceActive);
  const displayTrack = remote ? connectState?.song : activeTrack;
  const displayTrackKey = displayTrack
    ? String('mediaId' in displayTrack ? displayTrack.mediaId : ('id' in displayTrack ? displayTrack.id : ''))
    : '';
  useEffect(() => setLiked(false), [displayTrackKey]);
  const displayPlaying = remote ? Boolean(connectState?.playing) : Boolean(isPlaying);
  const displayPosition = remote
    ? Math.max(0, Number(connectState?.positionSeconds || 0) + (connectState?.playing ? Math.max(0, (Date.now() - Number(connectState.stateUpdatedAt || Date.now())) / 1000) : 0))
    : progress.position;
  if (!displayTrack) return null;

  const progressRatio = !remote && progress.duration > 0
    ? Math.min(displayPosition / progress.duration, 1)
    : 0;

  const run = (action: () => void) => {
    try {
      action();
    } catch {}
  };

  const artwork = typeof displayTrack.artworkUrl === 'string' ? displayTrack.artworkUrl : '';
  const control = (remoteAction: string, localAction: () => void) => {
    if (remote) void sendConnectControl(remoteAction).catch(() => {});
    else run(localAction);
  };
  const toggleShuffle = () => {
    try {
      setShuffle(toggleShuffleEnabled());
    } catch {}
  };
  const openQueue = () => {
    try { setQueue(getPlaybackQueue()); } catch { setQueue([]); }
    setQueueVisible(true);
  };
  const toggleLike = () => {
    if (!displayTrack) return;
    const extras = 'extras' in displayTrack && displayTrack.extras && typeof displayTrack.extras === 'object' ? displayTrack.extras : {};
    const mediaId = 'mediaId' in displayTrack ? displayTrack.mediaId : ('id' in displayTrack ? displayTrack.id : '');
    const directSourceId = 'sourceId' in displayTrack ? displayTrack.sourceId : '';
    const song = {
      id: String(extras.songId || mediaId || ''),
      sourceId: typeof extras.sourceId === 'string' ? extras.sourceId : String(directSourceId || mediaId || ''),
    };
    const nextLiked = !liked;
    setLiked(nextLiked);
    void sendRecommendationFeedback(song, nextLiked ? 'LIKE' : 'CLEAR').catch(() => setLiked(!nextLiked));
  };
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
          <Text style={styles.title} numberOfLines={1}>{displayTrack.title || 'Reproduzindo'}</Text>
          <Text style={styles.artist} numberOfLines={1}>
            {displayTrack.artist || ''}{remote ? ` · em ${connectState?.devices.find((device) => device.active)?.deviceName || 'outro dispositivo'}` : ''}
          </Text>
        </View>

        <TouchableOpacity accessibilityLabel={liked ? 'Descurtir música' : 'Curtir música'} onPress={toggleLike} style={[styles.primaryIcon, liked && styles.controlActive]}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={21} color={liked ? '#1db954' : '#d4d4d4'} />
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityLabel={displayPlaying ? 'Pausar' : 'Reproduzir'}
          onPress={() => control(displayPlaying ? 'PAUSE' : 'PLAY', togglePlayback)}
          style={styles.playButton}
        >
          <Ionicons name={displayPlaying ? 'pause' : 'play'} size={21} color="#121212" />
        </TouchableOpacity>
      </View>

      <View style={styles.secondaryControls}>
        <TouchableOpacity accessibilityLabel="Dispositivos conectados" onPress={() => setConnectVisible(true)} style={styles.control}><Ionicons name={remote ? 'desktop' : 'phone-portrait'} size={19} color={remote ? '#1db954' : '#bbb'} /></TouchableOpacity>
        <TouchableOpacity accessibilityLabel="Abrir JAM" onPress={() => setJamSheetVisible(true)} style={styles.control}><Ionicons name="radio-outline" size={19} color="#bbb" /></TouchableOpacity>
        <TouchableOpacity accessibilityLabel="Música anterior" onPress={() => control('PREVIOUS', playPrevious)} style={styles.control}><Ionicons name="play-skip-back" size={20} color="#bbb" /></TouchableOpacity>
        <TouchableOpacity accessibilityLabel="Alternar modo aleatório" onPress={toggleShuffle} style={[styles.control, shuffle && styles.controlActive]}><Ionicons name="shuffle" size={19} color={shuffle ? '#1db954' : '#bbb'} /></TouchableOpacity>
        <TouchableOpacity accessibilityLabel="Próxima música" onPress={() => control('NEXT', playNext)} style={styles.control}><Ionicons name="play-skip-forward" size={20} color="#bbb" /></TouchableOpacity>
        <TouchableOpacity accessibilityLabel="Abrir fila" onPress={openQueue} style={styles.control}><Ionicons name="list" size={20} color="#bbb" /></TouchableOpacity>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressRatio * 100}%` }]} />
      </View>
      <View style={styles.progressLabels}>
        <Text style={styles.progressText}>{formatTime(displayPosition)}</Text>
        <Text style={styles.progressText}>{remote ? 'remoto' : formatTime(progress.duration)}</Text>
      </View>
      <Modal visible={queueVisible} transparent animationType="slide" onRequestClose={() => setQueueVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.queueSheet}>
            <View style={styles.connectHeader}>
              <View><Text style={styles.connectTitle}>Fila de reprodução</Text><Text style={styles.connectSubtitle}>Veja de onde veio cada música.</Text></View>
              <TouchableOpacity onPress={() => setQueueVisible(false)} style={styles.closeButton}><Ionicons name="close" size={22} color="#fff" /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>{queue.map((item, index) => {
              const extras = item.extras && typeof item.extras === 'object' ? item.extras : {};
              const origin = extras.queueOrigin === 'recommendation' ? 'Recomendação' : extras.queueOrigin === 'playlist' ? 'Da playlist' : 'Escolhida por você';
              return (
                <TouchableOpacity key={`${item.mediaId}:${index}`} style={styles.queueRow} onPress={() => { playQueueIndex(index); setQueueVisible(false); }}>
                  <Text style={styles.queueIndex}>{index + 1}</Text>
                  <View style={styles.queueMeta}><Text style={styles.queueTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.queueArtist} numberOfLines={1}>{item.artist}</Text></View>
                  <Text style={[styles.originBadge, origin === 'Recomendação' && styles.recommendationBadge]}>{origin}</Text>
                </TouchableOpacity>
              );
            })}</ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={connectVisible} transparent animationType="fade" onRequestClose={() => setConnectVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.connectSheet}>
            <View style={styles.connectHeader}>
              <View>
                <Text style={styles.connectTitle}>NationMusics Connect</Text>
                <Text style={styles.connectSubtitle}>O som toca em um dispositivo por vez.</Text>
              </View>
              <TouchableOpacity onPress={() => setConnectVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            {(connectState?.devices || []).map((device) => {
              const current = device.deviceId === currentDeviceId;
              const deviceName = current
                ? 'Este celular'
                : device.platform === 'desktop' ? 'Computador' : device.deviceName;
              const deviceStatus = device.active
                ? connectState?.playing ? 'Reproduzindo neste dispositivo' : 'Pausado neste dispositivo'
                : current ? 'Este dispositivo' : 'Disponível';
              return (
                <View key={device.deviceId} style={[styles.deviceRow, device.active && styles.deviceActive]}>
                  <Ionicons name={device.platform === 'desktop' ? 'desktop-outline' : 'phone-portrait-outline'} size={22} color={device.active ? '#1db954' : '#aaa'} />
                  <View style={styles.deviceMeta}>
                    <Text style={styles.deviceName}>{deviceName}</Text>
                    <Text style={styles.deviceStatus}>{deviceStatus}</Text>
                  </View>
                  {device.active && connectState?.playing && <Ionicons name="volume-high" size={19} color="#1db954" />}
                </View>
              );
            })}
            {!connectState?.currentDeviceActive && (
              <TouchableOpacity style={styles.takeOverButton} onPress={() => void takeOverConnectPlayback().catch(() => {})}>
                <Ionicons name="phone-portrait" size={19} color="#111" />
                <Text style={styles.takeOverText}>Ouvir neste celular</Text>
              </TouchableOpacity>
            )}
            <View style={styles.remoteTools}>
              <TouchableOpacity style={styles.toolButton} onPress={() => void sendConnectControl('SEEK', Math.max(0, displayPosition - 15)).catch(() => {})}>
                <Ionicons name="play-back" size={19} color="#fff" /><Text style={styles.toolText}>15s</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolButton} onPress={() => void sendConnectControl('VOLUME', Math.max(0, Number(connectState?.volumeLevel || 0) - 0.1)).catch(() => {})}>
                <Ionicons name="volume-low" size={19} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.volumeText}>{Math.round(Number(connectState?.volumeLevel || 0) * 100)}%</Text>
              <TouchableOpacity style={styles.toolButton} onPress={() => void sendConnectControl('VOLUME', Math.min(1, Number(connectState?.volumeLevel || 0) + 0.1)).catch(() => {})}>
                <Ionicons name="volume-high" size={19} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolButton} onPress={() => void sendConnectControl('SEEK', displayPosition + 15).catch(() => {})}>
                <Ionicons name="play-forward" size={19} color="#fff" /><Text style={styles.toolText}>15s</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <JamControlSheet
        visible={jamSheetVisible}
        onClose={() => setJamSheetVisible(false)}
        activeTrack={activeTrack || undefined}
        positionSeconds={progress.position}
        playing={Boolean(isPlaying)}
      />
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
  control: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  primaryIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  controlActive: {
    backgroundColor: '#1db95418',
    borderRadius: 16,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginHorizontal: 2,
    backgroundColor: '#1db954',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: 6, paddingHorizontal: 4 },
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
  modalBackdrop: { flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' },
  connectSheet: { backgroundColor: '#181818', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 30, borderWidth: 1, borderColor: '#303030' },
  queueSheet: { maxHeight: '75%', backgroundColor: '#181818', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 30, borderWidth: 1, borderColor: '#303030' },
  queueRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#292929' },
  queueIndex: { width: 24, color: '#777', textAlign: 'center', fontWeight: '800' },
  queueMeta: { flex: 1, minWidth: 0 },
  queueTitle: { color: '#fff', fontSize: 13, fontWeight: '800' },
  queueArtist: { color: '#888', fontSize: 11, marginTop: 2 },
  originBadge: { color: '#aaa', backgroundColor: '#292929', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, fontSize: 9, fontWeight: '800' },
  recommendationBadge: { color: '#1db954', backgroundColor: '#1db95418' },
  connectHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  connectTitle: { color: '#fff', fontSize: 19, fontWeight: '800' },
  connectSubtitle: { color: '#999', fontSize: 12, marginTop: 3 },
  closeButton: { padding: 8 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', padding: 13, borderRadius: 12, backgroundColor: '#222', marginBottom: 8, borderWidth: 1, borderColor: '#2d2d2d' },
  deviceActive: { borderColor: '#1db95466', backgroundColor: '#1db95412' },
  deviceMeta: { flex: 1, marginLeft: 11 },
  deviceName: { color: '#fff', fontWeight: '700', fontSize: 14 },
  deviceStatus: { color: '#888', fontSize: 11, marginTop: 2 },
  takeOverButton: { flexDirection: 'row', gap: 8, backgroundColor: '#1db954', padding: 13, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  takeOverText: { color: '#111', fontWeight: '800' },
  remoteTools: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 16 },
  toolButton: { minWidth: 42, height: 38, borderRadius: 19, backgroundColor: '#292929', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  toolText: { color: '#fff', fontSize: 10, marginLeft: 2 },
  volumeText: { color: '#ccc', minWidth: 38, textAlign: 'center', fontSize: 12 },
});
