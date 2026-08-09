import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type MediaItem } from '@rntp/player';

import {
  addCurrentTrackToJamQueue,
  createJamFromPlayer,
  getCurrentJamCode,
  getJam,
  leaveJam,
  publishCurrentJamState,
  startFollowingJam,
  startHostingJam,
  stopJamSync,
  syncToJamSession,
  updateJamSettings,
  updateJamState,
  type JamSession,
} from '../services/jam';

type Tab = 'people' | 'settings' | 'queue';

type Props = {
  visible: boolean;
  onClose: () => void;
  activeTrack?: MediaItem | null;
  positionSeconds?: number;
  playing?: boolean;
  initialCode?: string;
  initialSession?: JamSession | null;
  onSessionChange?: (session: JamSession | null) => void;
};

function participantInitial(username: string) {
  return username.trim().slice(0, 1).toUpperCase() || '?';
}

function predictedPosition(session: JamSession) {
  const state = session.state;
  const offset = state.playing ? Math.max(0, (session.serverTime - state.updatedAt) / 1000) : 0;
  return Math.max(0, state.positionSeconds + offset);
}

export function JamControlSheet({
  visible,
  onClose,
  activeTrack,
  positionSeconds = 0,
  playing = false,
  initialCode = '',
  initialSession = null,
  onSessionChange,
}: Props) {
  const [session, setSession] = useState<JamSession | null>(initialSession);
  const [tab, setTab] = useState<Tab>('people');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');

  const activeCode = useMemo(
    () => initialCode || session?.code || getCurrentJamCode(),
    [initialCode, session?.code]
  );
  const canControl = Boolean(session?.canControl);
  const canManage = Boolean(session?.canManage || session?.owner);
  const canQueue = Boolean(session?.canQueue || canControl);
  const permissions = session?.permissions;
  const volume = Math.round(Math.max(0, Math.min(1, Number(session?.volumeLevel ?? session?.state?.volumeLevel ?? 1))) * 100);

  const applySession = useCallback((next: JamSession | null) => {
    setSession(next);
    onSessionChange?.(next);
  }, [onSessionChange]);

  useEffect(() => {
    if (!visible) return;
    setTab('people');
    if (initialSession) applySession(initialSession);

    const code = initialCode || initialSession?.code || getCurrentJamCode();
    if (!code) return;

    let cancelled = false;
    setLoading(true);
    getJam(code)
      .then(async (next) => {
        if (cancelled) return;
        applySession(next);
        await syncToJamSession(next).catch(() => {});
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applySession, initialCode, initialSession, visible]);

  const createJam = useCallback(async () => {
    if (!activeTrack || busy) return;
    setBusy('create');
    try {
      const created = await createJamFromPlayer(activeTrack, positionSeconds, Boolean(playing));
      applySession(created);
      startHostingJam(created.code, applySession);
      await Share.share({
        message: `Entre na minha JAM do NationMusics: ${created.inviteLink}\nCodigo: ${created.code}`,
      });
    } catch (error) {
      Alert.alert('Nao foi possivel criar a JAM', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setBusy('');
    }
  }, [activeTrack, applySession, busy, playing, positionSeconds]);

  const shareJam = useCallback(async () => {
    if (!session) return;
    await Share.share({
      message: `Entre na minha JAM do NationMusics: ${session.inviteLink}\nCodigo: ${session.code}`,
    });
  }, [session]);

  const leaveCurrentJam = useCallback(async () => {
    if (!activeCode) {
      applySession(null);
      return;
    }
    setBusy('leave');
    try {
      stopJamSync();
      await leaveJam(activeCode).catch(() => {});
      applySession(null);
      onClose();
    } finally {
      setBusy('');
    }
  }, [activeCode, applySession, onClose]);

  const refreshSession = useCallback(async () => {
    if (!activeCode) return;
    const next = await getJam(activeCode);
    applySession(next);
  }, [activeCode, applySession]);

  const publishCurrent = useCallback(async () => {
    if (!activeCode || !canControl) return;
    setBusy('publish');
    try {
      const next = await publishCurrentJamState(activeCode);
      applySession(next);
      if (next.owner) {
        startHostingJam(activeCode, applySession);
      } else {
        startFollowingJam(activeCode, applySession);
      }
    } catch (error) {
      Alert.alert('Nao foi possivel atualizar a JAM', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setBusy('');
    }
  }, [activeCode, applySession, canControl]);

  const togglePlayback = useCallback(async () => {
    if (!activeCode || !session || !canControl) return;
    setBusy('playback');
    try {
      const next = await updateJamState(activeCode, {
        song: session.state.song,
        positionSeconds: predictedPosition(session),
        playing: !session.state.playing,
        volumeLevel: session.volumeLevel ?? session.state.volumeLevel,
      });
      applySession(next);
      await syncToJamSession(next);
    } catch (error) {
      Alert.alert('Nao foi possivel controlar a JAM', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setBusy('');
    }
  }, [activeCode, applySession, canControl, session]);

  const changeVolume = useCallback(async (nextVolume: number) => {
    if (!activeCode || !session || !canControl) return;
    const volumeLevel = Math.max(0, Math.min(1, nextVolume / 100));
    setBusy('volume');
    try {
      const next = canManage
        ? await updateJamSettings(activeCode, { volumeLevel })
        : await updateJamState(activeCode, {
            song: session.state.song,
            positionSeconds: predictedPosition(session),
            playing: session.state.playing,
            volumeLevel,
          });
      applySession(next);
      await syncToJamSession(next);
    } catch (error) {
      Alert.alert('Nao foi possivel alterar o volume', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setBusy('');
    }
  }, [activeCode, applySession, canControl, canManage, session]);

  const updatePermission = useCallback(async (key: 'allowParticipantControl' | 'allowParticipantQueue' | 'syncVolume', value: boolean) => {
    if (!activeCode || !canManage) return;
    setBusy(key);
    try {
      const next = await updateJamSettings(activeCode, { [key]: value });
      applySession(next);
    } catch (error) {
      Alert.alert('Nao foi possivel salvar', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setBusy('');
    }
  }, [activeCode, applySession, canManage]);

  const addCurrentToQueue = useCallback(async () => {
    if (!activeCode || !canQueue) return;
    setBusy('queue');
    try {
      const next = await addCurrentTrackToJamQueue(activeCode);
      applySession(next);
    } catch (error) {
      Alert.alert('Nao foi possivel adicionar a fila', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setBusy('');
    }
  }, [activeCode, applySession, canQueue]);

  const participants = session?.participantDetails?.length
    ? session.participantDetails
    : (session?.participants || []).map((username) => ({
        username,
        owner: username === session?.hostUsername,
        active: true,
        joinedAt: 0,
        lastSeenAt: 0,
      }));

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>JAM</Text>
              <Text style={styles.title}>{session ? `Codigo ${session.code}` : 'Criar JAM'}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={22} color="#ddd" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color="#1db954" />
            </View>
          ) : !session ? (
            <View style={styles.emptyPanel}>
              <Ionicons name="radio-outline" size={40} color="#1db954" />
              <Text style={styles.emptyTitle}>Iniciar uma JAM</Text>
              <Text style={styles.emptyText}>Crie uma sala a partir da musica atual e compartilhe o link.</Text>
              <TouchableOpacity
                style={[styles.primaryButton, (!activeTrack || busy === 'create') && styles.disabledButton]}
                onPress={() => { void createJam(); }}
                disabled={!activeTrack || busy === 'create'}
              >
                {busy === 'create' ? <ActivityIndicator color="#121212" /> : <Ionicons name="radio-outline" size={19} color="#121212" />}
                <Text style={styles.primaryText}>Criar JAM</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.nowRow}>
                <View style={styles.nowIcon}>
                  <Ionicons name={session.state.playing ? 'volume-high' : 'pause'} size={21} color="#1db954" />
                </View>
                <View style={styles.nowText}>
                  <Text style={styles.songTitle} numberOfLines={1}>{session.state.song?.title || 'Aguardando musica'}</Text>
                  <Text style={styles.songArtist} numberOfLines={1}>{session.state.song?.artist || session.hostUsername}</Text>
                </View>
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => { void shareJam(); }}>
                  <Ionicons name="share-social-outline" size={18} color="#ddd" />
                  <Text style={styles.secondaryText}>Convidar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryButton, !canControl && styles.disabledButton]}
                  onPress={() => { void togglePlayback(); }}
                  disabled={!canControl || busy === 'playback'}
                >
                  <Ionicons name={session.state.playing ? 'pause' : 'play'} size={18} color="#ddd" />
                  <Text style={styles.secondaryText}>{session.state.playing ? 'Pausar' : 'Tocar'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dangerButton} onPress={() => { void leaveCurrentJam(); }}>
                  <Ionicons name="exit-outline" size={18} color="#ff7373" />
                </TouchableOpacity>
              </View>

              <View style={styles.tabRow}>
                {(['people', 'settings', 'queue'] as Tab[]).map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={[styles.tabButton, tab === item && styles.tabButtonActive]}
                    onPress={() => setTab(item)}
                  >
                    <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>
                      {item === 'people' ? 'Pessoas' : item === 'settings' ? 'Ajustes' : 'Fila'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
                {tab === 'people' && (
                  <>
                    <Text style={styles.sectionLabel}>{participants.filter((item) => item.active).length} conectado(s)</Text>
                    {participants.map((participant) => (
                      <View key={participant.username} style={styles.personRow}>
                        <View style={[styles.personAvatar, participant.active && styles.personAvatarActive]}>
                          <Text style={styles.personInitial}>{participantInitial(participant.username)}</Text>
                        </View>
                        <View style={styles.personText}>
                          <Text style={styles.personName}>{participant.username}</Text>
                          <Text style={styles.personMeta}>{participant.owner ? 'Dono da JAM' : participant.active ? 'Participando' : 'Saiu da sala'}</Text>
                        </View>
                      </View>
                    ))}
                  </>
                )}

                {tab === 'settings' && (
                  <>
                    <Text style={styles.sectionLabel}>{canManage ? 'Configuracoes da sala' : 'Permissoes da sala'}</Text>
                    <PermissionRow
                      label="Participantes controlam"
                      description="Permite pausar, despausar e trocar a musica"
                      value={Boolean(permissions?.allowParticipantControl)}
                      disabled={!canManage}
                      busy={busy === 'allowParticipantControl'}
                      onValueChange={(value) => updatePermission('allowParticipantControl', value)}
                    />
                    <PermissionRow
                      label="Participantes alteram fila"
                      description="Permite adicionar musicas na fila da JAM"
                      value={Boolean(permissions?.allowParticipantQueue)}
                      disabled={!canManage}
                      busy={busy === 'allowParticipantQueue'}
                      onValueChange={(value) => updatePermission('allowParticipantQueue', value)}
                    />
                    <PermissionRow
                      label="Sincronizar volume"
                      description="Volume da sala tambem muda nos aparelhos"
                      value={Boolean(permissions?.syncVolume)}
                      disabled={!canManage}
                      busy={busy === 'syncVolume'}
                      onValueChange={(value) => updatePermission('syncVolume', value)}
                    />
                    <View style={styles.volumePanel}>
                      <Text style={styles.settingLabel}>Volume da JAM</Text>
                      <Text style={styles.settingValue}>{volume}%</Text>
                      <View style={styles.volumeButtons}>
                        <TouchableOpacity style={styles.volumeButton} disabled={!canControl} onPress={() => { void changeVolume(volume - 10); }}>
                          <Ionicons name="remove" size={18} color="#ddd" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.volumeButton} disabled={!canControl} onPress={() => { void changeVolume(volume + 10); }}>
                          <Ionicons name="add" size={18} color="#ddd" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    {canControl ? (
                      <TouchableOpacity style={styles.fullButton} onPress={() => { void publishCurrent(); }} disabled={busy === 'publish'}>
                        <Ionicons name="musical-notes-outline" size={19} color="#121212" />
                        <Text style={styles.fullButtonText}>Enviar musica atual para a JAM</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.lockText}>O dono nao liberou controle para participantes.</Text>
                    )}
                  </>
                )}

                {tab === 'queue' && (
                  <>
                    <View style={styles.queueHeader}>
                      <Text style={styles.sectionLabel}>Fila da sala</Text>
                      <TouchableOpacity
                        style={[styles.queueAddButton, !canQueue && styles.disabledButton]}
                        onPress={() => { void addCurrentToQueue(); }}
                        disabled={!canQueue || busy === 'queue'}
                      >
                        <Ionicons name="add" size={18} color="#121212" />
                      </TouchableOpacity>
                    </View>
                    {(session.queue || []).length ? (session.queue || []).map((song, index) => (
                      <View key={`${song.sourceId || song.id}:${index}`} style={styles.queueRow}>
                        <Text style={styles.queueIndex}>{index + 1}</Text>
                        <View style={styles.queueText}>
                          <Text style={styles.queueTitle} numberOfLines={1}>{song.title}</Text>
                          <Text style={styles.queueArtist} numberOfLines={1}>{song.artist}</Text>
                        </View>
                      </View>
                    )) : (
                      <Text style={styles.lockText}>A fila ainda esta vazia.</Text>
                    )}
                  </>
                )}
              </ScrollView>

              <TouchableOpacity style={styles.refreshButton} onPress={() => { void refreshSession(); }}>
                <Ionicons name="refresh" size={17} color="#aaa" />
                <Text style={styles.refreshText}>Atualizar JAM</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function PermissionRow({
  label,
  description,
  value,
  disabled,
  busy,
  onValueChange,
}: {
  label: string;
  description: string;
  value: boolean;
  disabled: boolean;
  busy: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.permissionRow}>
      <View style={styles.settingText}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingValue}>{description}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color="#1db954" />
      ) : (
        <Switch
          value={value}
          disabled={disabled}
          onValueChange={onValueChange}
          thumbColor={value ? '#fff' : '#aaa'}
          trackColor={{ true: '#1db954', false: '#3a3a3a' }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.58)' },
  backdropTouch: { flex: 1 },
  sheet: {
    maxHeight: '86%',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#2c2c2c',
    backgroundColor: '#181818',
  },
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: '#444', marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  eyebrow: { color: '#1db954', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 3 },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#242424' },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  emptyPanel: { alignItems: 'center', gap: 12, paddingVertical: 22 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  emptyText: { color: '#999', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  primaryButton: {
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 18,
    backgroundColor: '#1db954',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryText: { color: '#121212', fontSize: 14, fontWeight: '900' },
  disabledButton: { opacity: 0.45 },
  nowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#202020',
    marginBottom: 10,
  },
  nowIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#101010', alignItems: 'center', justifyContent: 'center' },
  nowText: { flex: 1, minWidth: 0 },
  songTitle: { color: '#fff', fontSize: 15, fontWeight: '900' },
  songArtist: { color: '#999', fontSize: 12, marginTop: 3 },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  secondaryButton: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#242424',
    borderWidth: 1,
    borderColor: '#333',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  secondaryText: { color: '#ddd', fontSize: 12, fontWeight: '900' },
  dangerButton: {
    width: 46,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2b1d1d',
    borderWidth: 1,
    borderColor: '#563030',
  },
  tabRow: { height: 42, flexDirection: 'row', padding: 4, borderRadius: 13, backgroundColor: '#202020' },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  tabButtonActive: { backgroundColor: '#1db954' },
  tabText: { color: '#aaa', fontSize: 12, fontWeight: '900' },
  tabTextActive: { color: '#121212' },
  body: { marginTop: 12 },
  bodyContent: { paddingBottom: 10, gap: 9 },
  sectionLabel: { color: '#aaa', fontSize: 12, fontWeight: '900', marginBottom: 2 },
  personRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 10, borderRadius: 12, backgroundColor: '#202020' },
  personAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#333' },
  personAvatarActive: { backgroundColor: '#1db95430' },
  personInitial: { color: '#fff', fontSize: 14, fontWeight: '900' },
  personText: { flex: 1, minWidth: 0 },
  personName: { color: '#fff', fontSize: 14, fontWeight: '900' },
  personMeta: { color: '#888', fontSize: 12, marginTop: 2 },
  permissionRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: '#202020' },
  settingText: { flex: 1, minWidth: 0 },
  settingLabel: { color: '#eee', fontSize: 14, fontWeight: '900' },
  settingValue: { color: '#969696', fontSize: 12, marginTop: 2, lineHeight: 16 },
  volumePanel: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#202020' },
  volumeButtons: { flexDirection: 'row', gap: 10 },
  volumeButton: { flex: 1, height: 38, borderRadius: 19, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  fullButton: { height: 44, borderRadius: 22, backgroundColor: '#1db954', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  fullButtonText: { color: '#121212', fontSize: 13, fontWeight: '900' },
  lockText: { color: '#888', fontSize: 12, lineHeight: 17 },
  queueHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  queueAddButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1db954', alignItems: 'center', justifyContent: 'center' },
  queueRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: '#202020' },
  queueIndex: { width: 24, color: '#1db954', fontSize: 13, fontWeight: '900', textAlign: 'center' },
  queueText: { flex: 1, minWidth: 0 },
  queueTitle: { color: '#fff', fontSize: 14, fontWeight: '900' },
  queueArtist: { color: '#888', fontSize: 12, marginTop: 2 },
  refreshButton: { height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  refreshText: { color: '#aaa', fontSize: 12, fontWeight: '800' },
});
