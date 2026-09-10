import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  clearPlaybackSleepTimer,
  getPlaybackSleepTimerRemaining,
  setPlaybackSleepTimer,
} from '../services/player';

const TIMER_MINUTES = [5, 10, 15, 30, 45, 60, 90, 120];

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatTimer(seconds: number) {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min restantes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min restantes` : `${hours}h restantes`;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  artist: string;
  artworkUrl: string;
  playing: boolean;
  position: number;
  duration: number;
  remote: boolean;
  remoteDeviceName?: string;
  liked: boolean;
  shuffle: boolean;
  onTogglePlayback: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onToggleLike: () => void;
  onToggleShuffle: () => void;
  onSeek: (position: number) => void;
  onOpenQueue: () => void;
  onOpenDevices: () => void;
  onOpenJam: () => void;
};

export function FullPlayerModal(props: Props) {
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [progressWidth, setProgressWidth] = useState(1);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!props.visible) return;
    const refresh = () => setTimerRemaining(getPlaybackSleepTimerRemaining());
    refresh();
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, [props.visible]);

  const progressRatio = props.duration > 0 ? Math.min(Math.max(props.position / props.duration, 0), 1) : 0;
  const chooseTimer = (minutes: number) => {
    if (props.remote) return;
    setPlaybackSleepTimer(minutes);
    setTimerRemaining(minutes * 60);
  };
  const cancelTimer = () => {
    clearPlaybackSleepTimer();
    setTimerRemaining(null);
  };
  const openFromMenu = (action: () => void) => {
    setOptionsVisible(false);
    props.onClose();
    action();
  };

  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={props.onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityLabel="Fechar player" onPress={props.onClose} style={styles.headerButton}>
            <Ionicons name="chevron-down" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerMeta}>
            <Text style={styles.eyebrow}>TOCANDO AGORA</Text>
            {props.remote && <Text style={styles.deviceText} numberOfLines={1}>em {props.remoteDeviceName || 'outro dispositivo'}</Text>}
          </View>
          <TouchableOpacity accessibilityLabel="Mais opções" onPress={() => setOptionsVisible(true)} style={styles.headerButton}>
            <Ionicons name="ellipsis-horizontal" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {props.artworkUrl ? (
            <Image source={{ uri: props.artworkUrl }} style={styles.artwork} />
          ) : (
            <View style={[styles.artwork, styles.artworkPlaceholder]}>
              <Ionicons name="musical-notes" size={72} color="#1db954" />
            </View>
          )}

          <View style={styles.songRow}>
            <View style={styles.songMeta}>
              <Text style={styles.title} numberOfLines={2}>{props.title || 'Reproduzindo'}</Text>
              <Text style={styles.artist} numberOfLines={1}>{props.artist}</Text>
            </View>
            <TouchableOpacity accessibilityLabel={props.liked ? 'Remover curtida' : 'Curtir música'} onPress={props.onToggleLike} style={styles.likeButton}>
              <Ionicons name={props.liked ? 'heart' : 'heart-outline'} size={29} color={props.liked ? '#1db954' : '#ddd'} />
            </TouchableOpacity>
          </View>

          <Pressable
            accessibilityLabel="Posição da música"
            style={styles.progressTrack}
            onLayout={(event) => setProgressWidth(Math.max(1, event.nativeEvent.layout.width))}
            onPress={(event) => props.duration > 0 && props.onSeek((event.nativeEvent.locationX / progressWidth) * props.duration)}
          >
            <View style={[styles.progressFill, { width: `${progressRatio * 100}%` }]} />
            <View style={[styles.progressThumb, { left: `${progressRatio * 100}%` }]} />
          </Pressable>
          <View style={styles.timeRow}>
            <Text style={styles.time}>{formatTime(props.position)}</Text>
            <Text style={styles.time}>{formatTime(props.duration)}</Text>
          </View>

          <View style={styles.controls}>
            <TouchableOpacity accessibilityLabel="Alternar modo aleatório" onPress={props.onToggleShuffle} style={styles.sideControl}>
              <Ionicons name="shuffle" size={25} color={props.shuffle ? '#1db954' : '#ccc'} />
            </TouchableOpacity>
            <TouchableOpacity accessibilityLabel="Música anterior" onPress={props.onPrevious} style={styles.skipControl}>
              <Ionicons name="play-skip-back" size={34} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity accessibilityLabel={props.playing ? 'Pausar' : 'Reproduzir'} onPress={props.onTogglePlayback} style={styles.playButton}>
              <Ionicons name={props.playing ? 'pause' : 'play'} size={36} color="#07140b" />
            </TouchableOpacity>
            <TouchableOpacity accessibilityLabel="Próxima música" onPress={props.onNext} style={styles.skipControl}>
              <Ionicons name="play-skip-forward" size={34} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity accessibilityLabel="Abrir fila" onPress={() => openFromMenu(props.onOpenQueue)} style={styles.sideControl}>
              <Ionicons name="list" size={26} color="#ccc" />
            </TouchableOpacity>
          </View>

          {timerRemaining !== null && (
            <TouchableOpacity onPress={() => setOptionsVisible(true)} style={styles.timerStatus}>
              <Ionicons name="timer-outline" size={17} color="#1db954" />
              <Text style={styles.timerStatusText}>{formatTimer(timerRemaining)}</Text>
            </TouchableOpacity>
          )}
        </View>

        <Modal visible={optionsVisible} transparent animationType="fade" onRequestClose={() => setOptionsVisible(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOptionsVisible(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Opções</Text>
              <View style={styles.menuRow}>
                <TouchableOpacity style={styles.menuItem} onPress={() => openFromMenu(props.onOpenQueue)}><Ionicons name="list" size={23} color="#fff" /><Text style={styles.menuText}>Fila</Text></TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => openFromMenu(props.onOpenDevices)}><Ionicons name="phone-portrait-outline" size={23} color="#fff" /><Text style={styles.menuText}>Dispositivos</Text></TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => openFromMenu(props.onOpenJam)}><Ionicons name="radio-outline" size={23} color="#fff" /><Text style={styles.menuText}>JAM</Text></TouchableOpacity>
              </View>

              <View style={styles.timerHeader}>
                <View><Text style={styles.timerTitle}>Temporizador</Text><Text style={styles.timerSubtitle}>A música será pausada automaticamente.</Text></View>
                {timerRemaining !== null && <TouchableOpacity onPress={cancelTimer}><Text style={styles.cancelText}>Cancelar</Text></TouchableOpacity>}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timerChoices}>
                {TIMER_MINUTES.map((minutes) => (
                  <TouchableOpacity disabled={props.remote} key={minutes} onPress={() => chooseTimer(minutes)} style={[styles.timerChoice, props.remote && styles.timerChoiceDisabled]}>
                    <Text style={styles.timerChoiceText}>{minutes < 60 ? `${minutes} min` : minutes === 60 ? '1 hora' : minutes === 90 ? '1h 30' : '2 horas'}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {props.remote && <Text style={styles.remoteNotice}>O temporizador controla a reprodução neste celular. Para usá-lo, escolha “Ouvir neste celular” em Dispositivos.</Text>}
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b1710' },
  header: { height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  headerButton: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  headerMeta: { flex: 1, alignItems: 'center' },
  eyebrow: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  deviceText: { color: '#8fa096', fontSize: 10, marginTop: 2, maxWidth: 210 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 22 },
  artwork: { width: '100%', aspectRatio: 1, borderRadius: 18, backgroundColor: '#18241c' },
  artworkPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  songRow: { flexDirection: 'row', alignItems: 'center', marginTop: 28, marginBottom: 24 },
  songMeta: { flex: 1, paddingRight: 16 },
  title: { color: '#fff', fontSize: 22, lineHeight: 27, fontWeight: '900' },
  artist: { color: '#aab2ad', fontSize: 15, marginTop: 5 },
  likeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: '#415047', justifyContent: 'center' },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: '#fff' },
  progressThumb: { position: 'absolute', width: 13, height: 13, marginLeft: -6, borderRadius: 7, backgroundColor: '#fff' },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  time: { color: '#879189', fontSize: 11 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 },
  sideControl: { width: 42, height: 48, alignItems: 'center', justifyContent: 'center' },
  skipControl: { width: 50, height: 58, alignItems: 'center', justifyContent: 'center' },
  playButton: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#1ed760', alignItems: 'center', justifyContent: 'center' },
  timerStatus: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 22, backgroundColor: '#1db95418', borderRadius: 20, paddingHorizontal: 14, height: 36 },
  timerStatusText: { color: '#1ed760', fontSize: 12, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: '#000b', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#181818', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34, borderWidth: 1, borderColor: '#303030' },
  sheetHandle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: '#555', marginBottom: 16 },
  sheetTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 14 },
  menuRow: { flexDirection: 'row', gap: 10, marginBottom: 25 },
  menuItem: { flex: 1, minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, backgroundColor: '#252525' },
  menuText: { color: '#ddd', fontSize: 11, fontWeight: '800' },
  timerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timerTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },
  timerSubtitle: { color: '#888', fontSize: 11, marginTop: 3 },
  cancelText: { color: '#ff8585', fontSize: 12, fontWeight: '800', padding: 8 },
  timerChoices: { gap: 8, paddingVertical: 15 },
  timerChoice: { height: 38, paddingHorizontal: 15, borderRadius: 19, backgroundColor: '#292929', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#373737' },
  timerChoiceDisabled: { opacity: 0.35 },
  timerChoiceText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  remoteNotice: { color: '#9b9b9b', fontSize: 11, lineHeight: 16, marginTop: 2 },
});
