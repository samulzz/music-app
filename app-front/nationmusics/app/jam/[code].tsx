import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import GlobalMiniPlayer from '../../components/global-mini-player';
import { JamControlSheet } from '../../components/jam-control-sheet';
import {
  joinJam,
  leaveJam,
  startFollowingJam,
  startHostingJam,
  stopJamSync,
  syncToJamSession,
  type JamSession,
} from '../../services/jam';

function normalizeCode(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw || '').trim().toUpperCase();
}

export default function JamScreen() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const code = useMemo(() => normalizeCode(params.code), [params.code]);
  const [session, setSession] = useState<JamSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Entrando na JAM...');
  const [controlsVisible, setControlsVisible] = useState(false);

  useEffect(() => {
    if (!code) {
      setLoading(false);
      setStatus('Codigo de JAM invalido.');
      return;
    }

    let mounted = true;
    const connect = async () => {
      setLoading(true);
      setStatus('Entrando na JAM...');
      const joined = await joinJam(code);
      if (!mounted) return;
      setSession(joined);
      setStatus('Sincronizando com a musica do anfitriao...');
      await syncToJamSession(joined);
      if (!mounted) return;
      setLoading(false);
      setStatus('JAM conectada');
      const listener = (next: JamSession) => {
        if (mounted) setSession(next);
      };
      if (joined.owner) {
        startHostingJam(code, listener);
      } else {
        startFollowingJam(code, listener);
      }
    };

    connect().catch((error) => {
      if (!mounted) return;
      setLoading(false);
      setStatus(error instanceof Error ? error.message : 'Nao foi possivel entrar na JAM.');
      Alert.alert('JAM indisponivel', error instanceof Error ? error.message : 'Tente novamente.');
    });

    return () => {
      mounted = false;
      stopJamSync();
    };
  }, [code]);

  const shareJam = useCallback(async () => {
    if (!session) return;
    await Share.share({
      message: `Entre na minha JAM do NationMusics: ${session.inviteLink}\nCodigo: ${session.code}`,
    });
  }, [session]);

  const exitJam = useCallback(async () => {
    stopJamSync();
    if (code) await leaveJam(code).catch(() => {});
    router.back();
  }, [code, router]);

  const state = session?.state;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={exitJam}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.eyebrow}>JAM</Text>
          <Text style={styles.title}>{session ? `Codigo ${session.code}` : 'Entrar na JAM'}</Text>
          <Text style={styles.subtitle}>{status}</Text>
        </View>

        <View style={styles.nowPlaying}>
          {loading ? (
            <ActivityIndicator color="#1db954" size="large" />
          ) : (
            <>
              <Ionicons name="radio-outline" size={48} color="#1db954" />
              <Text style={styles.songTitle} numberOfLines={2}>
                {state?.song?.title || 'Aguardando musica'}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {state?.song?.artist || session?.hostUsername || ''}
              </Text>
          {session && (
            <Text style={styles.people}>
                  Dono: {session.hostUsername} - {session.participants.length} conectado{session.participants.length === 1 ? '' : 's'}
            </Text>
          )}
            </>
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => { void shareJam(); }} disabled={!session}>
            <Ionicons name="share-social-outline" size={20} color="#ddd" />
            <Text style={styles.secondaryText}>Compartilhar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setControlsVisible(true)} disabled={!session}>
            <Ionicons name="options-outline" size={20} color="#121212" />
            <Text style={styles.primaryText}>Controles</Text>
          </TouchableOpacity>
        </View>
      </View>

      <GlobalMiniPlayer bottomOffset={12 + Math.max(insets.bottom, 0)} />
      <JamControlSheet
        visible={controlsVisible}
        onClose={() => setControlsVisible(false)}
        initialCode={code}
        initialSession={session}
        onSessionChange={setSession}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#121212' },
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 14 },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: { marginTop: 30 },
  eyebrow: { color: '#1db954', fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 6 },
  subtitle: { color: '#999', fontSize: 13, marginTop: 8, lineHeight: 18 },
  nowPlaying: {
    minHeight: 230,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2b2b2b',
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    marginTop: 26,
  },
  songTitle: { color: '#fff', fontSize: 22, fontWeight: '900', textAlign: 'center', marginTop: 18 },
  artist: { color: '#aaa', fontSize: 14, marginTop: 7 },
  people: { color: '#1db954', fontSize: 12, fontWeight: '800', marginTop: 16 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  primaryButton: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1db954',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryText: { color: '#121212', fontSize: 14, fontWeight: '900' },
  secondaryButton: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#303030',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryText: { color: '#ddd', fontSize: 14, fontWeight: '900' },
});
