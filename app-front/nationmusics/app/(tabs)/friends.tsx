import { type ComponentProps, memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  acceptFriendRequest,
  declineFriendRequest,
  listFriendRequests,
  listFriends,
  removeFriend,
  searchFriends,
  sendFriendRequest,
  type FriendRequests,
  type FriendUser,
} from '../../services/friends';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const AVATAR_ICONS = new Set([
  'person',
  'musical-note',
  'headset',
  'radio',
  'star',
  'heart',
  'flame',
  'moon',
  'planet',
  'sparkles',
  'disc',
  'flash',
]);

function avatarIconName(icon?: string): IoniconName {
  return (AVATAR_ICONS.has(icon || '') ? icon : 'person') as IoniconName;
}

function formatRelative(timestamp?: number) {
  const value = Number(timestamp || 0);
  if (!value) return '';
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
  if (elapsedSeconds < 90) return 'agora';
  if (elapsedSeconds < 3600) return `ha ${Math.floor(elapsedSeconds / 60)} min`;
  if (elapsedSeconds < 86400) return `ha ${Math.floor(elapsedSeconds / 3600)} h`;
  return `em ${new Date(value).toLocaleDateString('pt-BR')}`;
}

function statusLabel(friend: FriendUser) {
  if (friend.presence?.activityHidden && !friend.presence.online) return 'Privado';
  if (!friend.presence?.online) return 'Offline';
  if (friend.presence.listening && friend.presence.song) return 'Ouvindo agora';
  return 'Online';
}

function friendSort(left: FriendUser, right: FriendUser) {
  const leftOnline = left.presence?.online ? 1 : 0;
  const rightOnline = right.presence?.online ? 1 : 0;
  if (leftOnline !== rightOnline) return rightOnline - leftOnline;
  const leftListening = left.presence?.listening ? 1 : 0;
  const rightListening = right.presence?.listening ? 1 : 0;
  if (leftListening !== rightListening) return rightListening - leftListening;
  return left.username.localeCompare(right.username, 'pt-BR', { sensitivity: 'base' });
}

const FriendCard = memo(function FriendCard({
  friend,
  busy,
  onAdd,
  onAccept,
  onDecline,
  onRemove,
  onJoinJam,
}: {
  friend: FriendUser;
  busy: boolean;
  onAdd: (friend: FriendUser) => void;
  onAccept: (friend: FriendUser) => void;
  onDecline: (friend: FriendUser) => void;
  onRemove: (friend: FriendUser) => void;
  onJoinJam: (code: string) => void;
}) {
  const song = friend.presence?.song;
  const online = Boolean(friend.presence?.online);
  const listening = Boolean(friend.presence?.listening && song);
  const jamCode = friend.presence?.activeJamCode?.trim();
  const lastListenedLabel = formatRelative(friend.presence?.lastListenedAt);
  const lastSeenLabel = formatRelative(friend.presence?.lastSeenAt);
  const hidden = Boolean(friend.presence?.activityHidden);
  const avatarIcon = avatarIconName(friend.presence?.avatarIcon);

  const primaryAction = () => {
    if (friend.relationship === 'none') onAdd(friend);
    if (friend.relationship === 'pending_incoming') onAccept(friend);
  };

  const primaryText = friend.relationship === 'none'
    ? 'Adicionar'
    : friend.relationship === 'pending_incoming'
    ? 'Aceitar'
    : friend.relationship === 'pending_outgoing'
    ? 'Pendente'
    : 'Amigo';

  return (
    <View style={styles.friendCard}>
      <View style={styles.avatar}>
        <Ionicons name={avatarIcon} size={21} color="#fff" />
        <View style={[styles.statusDot, online && styles.statusDotOnline]} />
      </View>

      <View style={styles.friendMain}>
        <View style={styles.friendHeader}>
          <Text style={styles.friendName} numberOfLines={1}>{friend.username}</Text>
          <Text style={[styles.statusText, online && styles.statusTextOnline]}>{statusLabel(friend)}</Text>
        </View>

        {listening && song ? (
          <View style={styles.songLine}>
            {song.artworkUrl ? (
              <Image source={{ uri: song.artworkUrl }} style={styles.songCover} />
            ) : (
              <View style={styles.songCoverPlaceholder}>
                <Ionicons name="musical-note" size={14} color="#1db954" />
              </View>
            )}
            <View style={styles.songText}>
              <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
              <Text style={styles.songArtist} numberOfLines={1}>{song.artist}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.friendHint}>
            {hidden && !online
              ? 'Atividade privada.'
              : lastListenedLabel
              ? `Ouviu musica ${lastListenedLabel}.`
              : lastSeenLabel
              ? `Visto ${lastSeenLabel}.`
              : online ? 'Disponivel no app.' : 'Ultima atividade aparece quando abrir o app.'}
          </Text>
        )}

        <View style={styles.actions}>
          {jamCode ? (
            <TouchableOpacity style={styles.joinButton} onPress={() => onJoinJam(jamCode)}>
              <Ionicons name="radio-outline" size={16} color="#121212" />
              <Text style={styles.joinText}>Entrar na JAM</Text>
            </TouchableOpacity>
          ) : null}

          {friend.relationship === 'friends' ? (
            <TouchableOpacity style={styles.ghostButton} onPress={() => onRemove(friend)} disabled={busy}>
              <Ionicons name="person-remove-outline" size={16} color="#aaa" />
              <Text style={styles.ghostText}>Remover</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.actionButton, friend.relationship === 'pending_outgoing' && styles.actionButtonDisabled]}
              onPress={primaryAction}
              disabled={busy || friend.relationship === 'pending_outgoing'}
            >
              {busy ? <ActivityIndicator size="small" color="#121212" /> : <Text style={styles.actionText}>{primaryText}</Text>}
            </TouchableOpacity>
          )}

          {friend.relationship === 'pending_incoming' && (
            <TouchableOpacity style={styles.ghostButton} onPress={() => onDecline(friend)} disabled={busy}>
              <Text style={styles.ghostText}>Recusar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
});

export default function FriendsScreen() {
  const router = useRouter();
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [requests, setRequests] = useState<FriendRequests>({ incoming: [], outgoing: [] });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyUser, setBusyUser] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(0);

  const sortedFriends = useMemo(() => [...friends].sort(friendSort), [friends]);
  const trimmedQuery = query.trim();
  const showingSearch = trimmedQuery.length >= 2;

  const refresh = useCallback(async (showSpinner = false, notifyError = false) => {
    if (showSpinner) setLoading(true);
    try {
      const [nextFriends, nextRequests] = await Promise.all([
        listFriends(),
        listFriendRequests(),
      ]);
      setFriends(nextFriends);
      setRequests(nextRequests);
      setLastUpdatedAt(Date.now());
    } catch (error) {
      if (showSpinner || notifyError) {
        Alert.alert('Nao foi possivel carregar amigos', error instanceof Error ? error.message : 'Tente novamente.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh(true);
      const timer = setInterval(() => {
        void refresh(false);
      }, 10_000);
      const appStateSubscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') void refresh(false);
      });
      return () => {
        clearInterval(timer);
        appStateSubscription.remove();
      };
    }, [refresh])
  );

  useEffect(() => {
    if (!showingSearch) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      searchFriends(trimmedQuery)
        .then((next) => {
          if (!cancelled) setResults(next);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showingSearch, trimmedQuery]);

  const runForUser = useCallback(async (username: string, action: () => Promise<unknown>) => {
    setBusyUser(username);
    try {
      await action();
      await refresh(false);
      if (showingSearch) {
        setResults(await searchFriends(trimmedQuery));
      }
    } catch (error) {
      Alert.alert('Nao foi possivel concluir', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setBusyUser('');
    }
  }, [refresh, showingSearch, trimmedQuery]);

  const add = useCallback((friend: FriendUser) => {
    void runForUser(friend.username, () => sendFriendRequest(friend.username));
  }, [runForUser]);

  const accept = useCallback((friend: FriendUser) => {
    if (!friend.requestId) return;
    void runForUser(friend.username, () => acceptFriendRequest(friend.requestId || 0));
  }, [runForUser]);

  const decline = useCallback((friend: FriendUser) => {
    if (!friend.requestId) return;
    void runForUser(friend.username, () => declineFriendRequest(friend.requestId || 0));
  }, [runForUser]);

  const remove = useCallback((friend: FriendUser) => {
    Alert.alert('Remover amigo', `Remover ${friend.username} da sua lista?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => {
          void runForUser(friend.username, () => removeFriend(friend.username));
        },
      },
    ]);
  }, [runForUser]);

  const joinJam = useCallback((code: string) => {
    router.push(`/jam/${encodeURIComponent(code)}` as never);
  }, [router]);

  const renderFriend = useCallback(({ item }: { item: FriendUser }) => (
    <FriendCard
      friend={item}
      busy={busyUser === item.username}
      onAdd={add}
      onAccept={accept}
      onDecline={decline}
      onRemove={remove}
      onJoinJam={joinJam}
    />
  ), [accept, add, busyUser, decline, joinJam, remove]);

  const data = showingSearch
    ? results
    : [
        ...requests.incoming,
        ...sortedFriends,
        ...requests.outgoing,
      ];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>SOCIAL</Text>
            <Text style={styles.title}>Amigos</Text>
            <View style={styles.summaryRow}>
              <View style={styles.liveDot} />
              <Text style={styles.summary}>
                {friends.filter((friend) => friend.presence?.online).length} online / {friends.length} amigos
              </Text>
              <Text style={styles.autoRefreshText}>
                {lastUpdatedAt ? 'atualização automática' : 'sincronizando'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={19} color="#777" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar usuario para adicionar"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close" size={20} color="#777" />
            </TouchableOpacity>
          ) : null}
        </View>

        {!showingSearch && requests.incoming.length > 0 && (
          <View style={styles.banner}>
            <Ionicons name="person-add-outline" size={18} color="#1db954" />
            <Text style={styles.bannerText}>
              {requests.incoming.length} convite{requests.incoming.length === 1 ? '' : 's'} esperando resposta.
            </Text>
          </View>
        )}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#1db954" size="large" />
          </View>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => `${item.relationship}:${item.username}`}
            renderItem={renderFriend}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                tintColor="#1db954"
                colors={['#1db954']}
                onRefresh={() => {
                  setRefreshing(true);
                  void refresh(false, true);
                }}
              />
            }
            ListHeaderComponent={
              <Text style={styles.listTitle}>
                {showingSearch ? 'Resultados' : 'Sua lista'}
              </Text>
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={48} color="#555" />
                <Text style={styles.emptyTitle}>
                  {showingSearch ? 'Nenhum usuario encontrado' : 'Nenhum amigo ainda'}
                </Text>
                <Text style={styles.emptyText}>
                  {showingSearch
                    ? 'Confira o nome e tente de novo.'
                    : 'Busque pelo nome de usuario para adicionar alguem.'}
                </Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#121212' },
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
    paddingRight: 54,
  },
  eyebrow: { color: '#1db954', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#fff', fontSize: 29, fontWeight: '900', marginTop: 2 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#1db954' },
  summary: { color: '#aaa', fontSize: 12 },
  autoRefreshText: { color: '#5f7f69', fontSize: 10, fontWeight: '700' },
  searchBox: {
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: '#2d2d2d',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 0 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#17281d',
    borderColor: '#275d38',
    borderWidth: 1,
    borderRadius: 12,
    padding: 11,
    marginBottom: 12,
  },
  bannerText: { color: '#a9d9b7', fontSize: 12, flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 170 },
  listTitle: { color: '#aaa', fontSize: 12, fontWeight: '800', marginBottom: 10 },
  friendCard: {
    flexDirection: 'row',
    backgroundColor: '#1b1b1b',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#252525',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 17 },
  statusDot: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#555',
    borderWidth: 2,
    borderColor: '#1b1b1b',
  },
  statusDotOnline: { backgroundColor: '#1db954' },
  friendMain: { flex: 1 },
  friendHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  friendName: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '900' },
  statusText: { color: '#777', fontSize: 11, fontWeight: '800' },
  statusTextOnline: { color: '#1db954' },
  friendHint: { color: '#777', fontSize: 12, marginTop: 7 },
  songLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 8,
  },
  songCover: { width: 36, height: 36, borderRadius: 7, marginRight: 9 },
  songCoverPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 7,
    marginRight: 9,
    backgroundColor: '#242424',
    alignItems: 'center',
    justifyContent: 'center',
  },
  songText: { flex: 1 },
  songTitle: { color: '#fff', fontSize: 13, fontWeight: '800' },
  songArtist: { color: '#888', fontSize: 11, marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  joinButton: {
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1db954',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  joinText: { color: '#121212', fontSize: 12, fontWeight: '900' },
  actionButton: {
    height: 34,
    minWidth: 92,
    borderRadius: 17,
    backgroundColor: '#1db954',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionButtonDisabled: { backgroundColor: '#333' },
  actionText: { color: '#121212', fontSize: 12, fontWeight: '900' },
  ghostButton: {
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#222',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  ghostText: { color: '#aaa', fontSize: 12, fontWeight: '800' },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 30 },
  emptyTitle: { color: '#ddd', fontSize: 17, fontWeight: '800', marginTop: 14 },
  emptyText: { color: '#777', fontSize: 13, textAlign: 'center', marginTop: 7 },
});
