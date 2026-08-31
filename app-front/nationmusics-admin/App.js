import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'https://pseudoprincely-plumular-nikolas.ngrok-free.dev/api';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || '';
const NGROK_BYPASS = 'true';

const DEFAULT_ADMIN_USERNAME = process.env.EXPO_PUBLIC_ADMIN_USERNAME || '';
const DEFAULT_ADMIN_PASSWORD = process.env.EXPO_PUBLIC_ADMIN_PASSWORD || '';

const EMPTY_FORM = {
  name: '',
  description: '',
  iconUrl: '',
  globalPlaylist: true,
};

const normalizeText = (value) => (value || '').trim().toLowerCase();

export default function App() {
  const [session, setSession] = useState(null);
  const [loadingBoot, setLoadingBoot] = useState(true);

  const [username, setUsername] = useState(DEFAULT_ADMIN_USERNAME);
  const [password, setPassword] = useState(DEFAULT_ADMIN_PASSWORD);
  const [authLoading, setAuthLoading] = useState(false);

  const [playlists, setPlaylists] = useState([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);

  const [playlistFormVisible, setPlaylistFormVisible] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState(null);
  const [playlistForm, setPlaylistForm] = useState(EMPTY_FORM);
  const [savingPlaylist, setSavingPlaylist] = useState(false);

  const [songsSearch, setSongsSearch] = useState('');
  const [songsResult, setSongsResult] = useState([]);
  const [loadingSongs, setLoadingSongs] = useState(false);
  const [updatingSongs, setUpdatingSongs] = useState(false);
  const [hasSearchedSongs, setHasSearchedSongs] = useState(false);

  useEffect(() => {
    const boot = async () => {
      try {
        const raw = await AsyncStorage.getItem('adminSession');
        if (!raw) {
          setLoadingBoot(false);
          return;
        }

        const parsed = JSON.parse(raw);
        if (!parsed.adminToken || parsed.expiresAt < Date.now()) {
          await AsyncStorage.removeItem('adminSession');
          setLoadingBoot(false);
          return;
        }

        setSession(parsed);
      } catch {
        await AsyncStorage.removeItem('adminSession');
      } finally {
        setLoadingBoot(false);
      }
    };

    void boot();
  }, []);

  useEffect(() => {
    if (!session) {
      setPlaylists([]);
      setSelectedPlaylist(null);
      return;
    }

    void fetchPlaylists(session.adminToken);
  }, [session]);

  const selectedSongIds = useMemo(() => {
    return new Set((selectedPlaylist?.songs ?? []).map((song) => song.id));
  }, [selectedPlaylist]);

  const selectedSourceIds = useMemo(() => {
    return new Set((selectedPlaylist?.songs ?? []).map((song) => song.sourceId).filter(Boolean));
  }, [selectedPlaylist]);

  const selectedTitleArtistKeys = useMemo(() => {
    return new Set(
      (selectedPlaylist?.songs ?? []).map((song) => `${normalizeText(song.title)}|${normalizeText(song.artist)}`)
    );
  }, [selectedPlaylist]);

  const getHeaders = (adminToken, includeJson = false) => ({
    'X-API-KEY': API_KEY,
    'X-ADMIN-TOKEN': adminToken,
    'ngrok-skip-browser-warning': NGROK_BYPASS,
    Accept: 'application/json',
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
  });

  const fetchPlaylists = async (adminToken) => {
    setLoadingPlaylists(true);
    try {
      const res = await fetch(`${BASE_URL}/admin/playlists`, {
        headers: getHeaders(adminToken),
      });

      if (!res.ok) {
        const msg = (await res.text()).trim();
        throw new Error(msg || 'Não foi possível carregar playlists.');
      }

      const data = await res.json();
      setPlaylists(Array.isArray(data) ? data : []);

      if (selectedPlaylist) {
        const refreshed = (Array.isArray(data) ? data : []).find((p) => p.id === selectedPlaylist.id);
        if (refreshed) setSelectedPlaylist(refreshed);
      }
    } catch (e) {
      Alert.alert('Erro', e.message || 'Falha ao carregar playlists.');
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const login = async () => {
    setAuthLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/admin/auth/login`, {
        method: 'POST',
        headers: {
          'X-API-KEY': API_KEY,
          'ngrok-skip-browser-warning': NGROK_BYPASS,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      if (!res.ok) {
        const msg = (await res.text()).trim();
        throw new Error(msg || 'Login admin inválido.');
      }

      const data = await res.json();
      const nextSession = {
        username: data.username,
        adminToken: data.adminToken,
        expiresAt: data.expiresAt,
      };

      await AsyncStorage.setItem('adminSession', JSON.stringify(nextSession));
      setSession(nextSession);
      Alert.alert('Sucesso', 'Login admin efetuado.');
    } catch (e) {
      Alert.alert('Erro', e.message || 'Falha ao autenticar admin.');
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('adminSession');
    setSession(null);
  };

  const openCreatePlaylist = () => {
    setEditingPlaylist(null);
    setPlaylistForm(EMPTY_FORM);
    setPlaylistFormVisible(true);
  };

  const openEditPlaylist = (playlist) => {
    setEditingPlaylist(playlist);
    setPlaylistForm({
      name: playlist.name ?? '',
      description: playlist.description ?? '',
      iconUrl: playlist.iconUrl ?? '',
      globalPlaylist: !!playlist.globalPlaylist,
    });
    setPlaylistFormVisible(true);
  };

  const savePlaylist = async () => {
    if (!session) return;

    if (!playlistForm.name.trim()) {
      Alert.alert('Atenção', 'Nome da playlist é obrigatório.');
      return;
    }

    setSavingPlaylist(true);
    try {
      const method = editingPlaylist ? 'PUT' : 'POST';
      const url = editingPlaylist
        ? `${BASE_URL}/admin/playlists/${editingPlaylist.id}`
        : `${BASE_URL}/admin/playlists`;

      const res = await fetch(url, {
        method,
        headers: getHeaders(session.adminToken, true),
        body: JSON.stringify({
          name: playlistForm.name.trim(),
          description: playlistForm.description.trim() || null,
          iconUrl: playlistForm.iconUrl.trim() || null,
          globalPlaylist: playlistForm.globalPlaylist,
        }),
      });

      if (!res.ok) {
        const msg = (await res.text()).trim();
        throw new Error(msg || 'Erro ao salvar playlist.');
      }

      setPlaylistFormVisible(false);
      setPlaylistForm(EMPTY_FORM);
      setEditingPlaylist(null);
      await fetchPlaylists(session.adminToken);
    } catch (e) {
      Alert.alert('Erro', e.message || 'Não foi possível salvar playlist.');
    } finally {
      setSavingPlaylist(false);
    }
  };

  const deletePlaylist = async (playlist) => {
    if (!session) return;

    Alert.alert('Excluir playlist', `Excluir "${playlist.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await fetch(`${BASE_URL}/admin/playlists/${playlist.id}`, {
              method: 'DELETE',
              headers: getHeaders(session.adminToken),
            });

            if (!res.ok) {
              const msg = (await res.text()).trim();
              throw new Error(msg || 'Não foi possível excluir a playlist.');
            }

            if (selectedPlaylist?.id === playlist.id) {
              setSelectedPlaylist(null);
            }

            await fetchPlaylists(session.adminToken);
          } catch (e) {
            Alert.alert('Erro', e.message || 'Falha ao excluir playlist.');
          }
        },
      },
    ]);
  };

  const pickPlaylist = async (playlist) => {
    if (!session) return;

    try {
      const res = await fetch(`${BASE_URL}/admin/playlists/${playlist.id}`, {
        headers: getHeaders(session.adminToken),
      });

      if (!res.ok) {
        const msg = (await res.text()).trim();
        throw new Error(msg || 'Não foi possível carregar detalhes da playlist.');
      }

      const data = await res.json();
      setSelectedPlaylist(data);
      setSongsResult([]);
      setSongsSearch('');
      setHasSearchedSongs(false);
    } catch (e) {
      Alert.alert('Erro', e.message || 'Falha ao abrir playlist.');
    }
  };

  const searchSongs = async () => {
    if (!session || !selectedPlaylist) return;

    setLoadingSongs(true);
    try {
      const query = songsSearch.trim();
      const localRes = await fetch(`${BASE_URL}/admin/songs/search?q=${encodeURIComponent(query)}`, {
        headers: getHeaders(session.adminToken),
      });

      if (!localRes.ok) {
        const msg = (await localRes.text()).trim();
        throw new Error(msg || 'Não foi possível buscar músicas.');
      }

      const localDataRaw = await localRes.json();
      const localData = Array.isArray(localDataRaw)
        ? localDataRaw.map((song) => ({
            type: 'local',
            key: `local-${song.id}`,
            id: song.id,
            title: song.title,
            artist: song.artist,
            coverUrl: song.coverUrl,
            sourceId: song.sourceId,
          }))
        : [];

      let externalData = [];
      if (query) {
        const externalRes = await fetch(`${BASE_URL}/admin/musicas/buscar?q=${encodeURIComponent(query)}`, {
          headers: getHeaders(session.adminToken),
        });

        if (externalRes.ok) {
          const externalRaw = await externalRes.json();
          externalData = Array.isArray(externalRaw)
            ? externalRaw.map((item) => ({
                type: 'external',
                key: `external-${item.id}`,
                externalId: item.id,
                title: item.titulo,
                artist: item.artista,
                coverUrl: item.capa,
              }))
            : [];
        } else {
          const errorText = (await externalRes.text()).trim();
          throw new Error(errorText || `Busca externa falhou (${externalRes.status}).`);
        }
      }

      const localSourceIds = new Set(localData.map((song) => song.sourceId).filter(Boolean));
      const localTitleArtistKeys = new Set(localData.map((song) => `${normalizeText(song.title)}|${normalizeText(song.artist)}`));
      const externalFiltered = externalData.filter((item) => {
        const bySource = item.externalId && localSourceIds.has(item.externalId);
        const byName = localTitleArtistKeys.has(`${normalizeText(item.title)}|${normalizeText(item.artist)}`);
        return !bySource && !byName;
      });

      const merged = [...localData, ...externalFiltered];

      setSongsResult(merged);
      setHasSearchedSongs(true);

      if (merged.length === 0) {
        Alert.alert('Sem resultados', 'Nenhuma música encontrada no banco nem na API externa para esse termo.');
      }
    } catch (e) {
      Alert.alert('Erro', e.message || 'Falha ao buscar músicas.');
    } finally {
      setLoadingSongs(false);
    }
  };

  const addSongToPlaylist = async (songId) => {
    if (!session || !selectedPlaylist) return;

    setUpdatingSongs(true);
    try {
      const res = await fetch(`${BASE_URL}/admin/playlists/${selectedPlaylist.id}/songs`, {
        method: 'POST',
        headers: getHeaders(session.adminToken, true),
        body: JSON.stringify({ songIds: [songId] }),
      });

      if (!res.ok) {
        const msg = (await res.text()).trim();
        throw new Error(msg || 'Não foi possível adicionar música.');
      }

      const updated = await res.json();
      setSelectedPlaylist(updated);
    } catch (e) {
      Alert.alert('Erro', e.message || 'Falha ao adicionar música.');
    } finally {
      setUpdatingSongs(false);
    }
  };

  const importExternalAndAddSong = async (item) => {
    if (!session || !selectedPlaylist) return;

    setUpdatingSongs(true);
    try {
      const importRes = await fetch(`${BASE_URL}/admin/songs/import`, {
        method: 'POST',
        headers: getHeaders(session.adminToken, true),
        body: JSON.stringify({
          title: item.title,
          artist: item.artist,
          coverUrl: item.coverUrl || null,
          sourceId: item.externalId || null,
          uri: null,
        }),
      });

      if (!importRes.ok) {
        const msg = (await importRes.text()).trim();
        throw new Error(msg || 'Falha ao importar música externa.');
      }

      const importedSong = await importRes.json();
      await addSongToPlaylist(importedSong.id);
    } catch (e) {
      Alert.alert('Erro', e.message || 'Não foi possível importar e adicionar a música.');
      setUpdatingSongs(false);
    }
  };

  const removeSongFromPlaylist = async (songId) => {
    if (!session || !selectedPlaylist) return;

    setUpdatingSongs(true);
    try {
      const res = await fetch(`${BASE_URL}/admin/playlists/${selectedPlaylist.id}/songs/${songId}`, {
        method: 'DELETE',
        headers: getHeaders(session.adminToken),
      });

      if (!res.ok) {
        const msg = (await res.text()).trim();
        throw new Error(msg || 'Não foi possível remover música.');
      }

      const updated = await res.json();
      setSelectedPlaylist(updated);
    } catch (e) {
      Alert.alert('Erro', e.message || 'Falha ao remover música.');
    } finally {
      setUpdatingSongs(false);
    }
  };

  if (loadingBoot) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#1db954" />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.authCard}>
          <Text style={styles.title}>NationMusics Admin</Text>
          <Text style={styles.subtitle}>Gestão de playlists globais</Text>

          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            placeholder="Usuário"
            placeholderTextColor="#6b7280"
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Senha"
            placeholderTextColor="#6b7280"
          />

          <TouchableOpacity style={styles.primaryButton} onPress={() => void login()} disabled={authLoading}>
            {authLoading ? <ActivityIndicator color="#111827" /> : <Text style={styles.primaryButtonText}>Entrar</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Playlists Globais</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => void logout()}>
          <Text style={styles.secondaryButtonText}>Sair</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.rowActions}>
        <TouchableOpacity style={styles.primaryButton} onPress={openCreatePlaylist}>
          <Text style={styles.primaryButtonText}>Nova Playlist</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => void fetchPlaylists(session.adminToken)}>
          <Text style={styles.secondaryButtonText}>Atualizar</Text>
        </TouchableOpacity>
      </View>

      {loadingPlaylists ? (
        <ActivityIndicator color="#1db954" style={{ marginTop: 12 }} />
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.playlistCard} onPress={() => void pickPlaylist(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.playlistName}>{item.name}</Text>
                <Text style={styles.playlistDescription} numberOfLines={2}>{item.description || 'Sem descrição'}</Text>
                <Text style={styles.smallMuted}>Global: {item.globalPlaylist ? 'Sim' : 'Não'} • Músicas: {item.songs?.length || 0}</Text>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.smallButton} onPress={() => openEditPlaylist(item)}>
                  <Text style={styles.smallButtonText}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallDangerButton} onPress={() => deletePlaylist(item)}>
                  <Text style={styles.smallButtonText}>Excluir</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {selectedPlaylist && (
        <View style={styles.songsPanel}>
          <Text style={styles.sectionTitle}>Playlist Selecionada: {selectedPlaylist.name}</Text>
          <TextInput
            style={styles.input}
            value={songsSearch}
            onChangeText={setSongsSearch}
            placeholder="Buscar música por título/artista"
            placeholderTextColor="#6b7280"
            onSubmitEditing={() => void searchSongs()}
          />

          <View style={styles.rowActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => void searchSongs()}>
              <Text style={styles.secondaryButtonText}>Buscar Músicas</Text>
            </TouchableOpacity>
            {loadingSongs && <ActivityIndicator color="#1db954" />}
            {updatingSongs && <ActivityIndicator color="#1db954" />}
          </View>

          <FlatList
            data={songsResult}
            keyExtractor={(item) => item.key}
            style={{ maxHeight: 230 }}
            ListEmptyComponent={
              hasSearchedSongs && !loadingSongs
                ? <Text style={styles.smallMuted}>Nenhuma música encontrada para essa busca.</Text>
                : null
            }
            renderItem={({ item }) => {
              const key = `${normalizeText(item.title)}|${normalizeText(item.artist)}`;
              const linked = item.type === 'local'
                ? selectedSongIds.has(item.id)
                : (item.externalId && selectedSourceIds.has(item.externalId)) || selectedTitleArtistKeys.has(key);

              return (
                <View style={styles.songRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.songTitle}>{item.title}</Text>
                    <Text style={styles.smallMuted}>{item.artist}</Text>
                    {item.type === 'external' && (
                      <Text style={styles.smallMuted}>Origem: API externa</Text>
                    )}
                  </View>
                  {linked ? (
                    item.type === 'local' ? (
                      <TouchableOpacity style={styles.smallDangerButton} onPress={() => void removeSongFromPlaylist(item.id)}>
                        <Text style={styles.smallButtonText}>Remover</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.smallLinkedBadge}>
                        <Text style={styles.smallButtonText}>Na playlist</Text>
                      </View>
                    )
                  ) : (
                    <TouchableOpacity
                      style={styles.smallButton}
                      onPress={() => {
                        if (item.type === 'local') {
                          void addSongToPlaylist(item.id);
                        } else {
                          void importExternalAndAddSong(item);
                        }
                      }}
                    >
                      <Text style={styles.smallButtonText}>Adicionar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
          />
        </View>
      )}

      <Modal visible={playlistFormVisible} transparent animationType="fade" onRequestClose={() => setPlaylistFormVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>{editingPlaylist ? 'Editar Playlist' : 'Nova Playlist'}</Text>

            <TextInput
              style={styles.input}
              value={playlistForm.name}
              onChangeText={(value) => setPlaylistForm((prev) => ({ ...prev, name: value }))}
              placeholder="Nome"
              placeholderTextColor="#6b7280"
            />
            <TextInput
              style={styles.input}
              value={playlistForm.description}
              onChangeText={(value) => setPlaylistForm((prev) => ({ ...prev, description: value }))}
              placeholder="Descrição"
              placeholderTextColor="#6b7280"
            />
            <TextInput
              style={styles.input}
              value={playlistForm.iconUrl}
              onChangeText={(value) => setPlaylistForm((prev) => ({ ...prev, iconUrl: value }))}
              placeholder="URL do ícone/capa"
              placeholderTextColor="#6b7280"
            />

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setPlaylistForm((prev) => ({ ...prev, globalPlaylist: !prev.globalPlaylist }))}
            >
              <Text style={styles.secondaryButtonText}>
                Playlist global: {playlistForm.globalPlaylist ? 'Sim' : 'Não'}
              </Text>
            </TouchableOpacity>

            <View style={styles.rowActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setPlaylistFormVisible(false)}>
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={() => void savePlaylist()} disabled={savingPlaylist}>
                {savingPlaylist
                  ? <ActivityIndicator color="#111827" />
                  : <Text style={styles.primaryButtonText}>Salvar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0b0f16',
    padding: 14,
  },
  centered: {
    flex: 1,
    backgroundColor: '#0b0f16',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authCard: {
    marginTop: 80,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#111827',
    padding: 16,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    color: '#f9fafb',
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9ca3af',
    marginBottom: 6,
  },
  sectionTitle: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#111827',
    color: '#f9fafb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryButton: {
    backgroundColor: '#22c55e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: '#0b0f16',
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#1f2937',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#f9fafb',
    fontWeight: '600',
  },
  playlistCard: {
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    gap: 8,
  },
  playlistName: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  playlistDescription: {
    color: '#d1d5db',
    fontSize: 12,
    marginBottom: 4,
  },
  smallMuted: {
    color: '#9ca3af',
    fontSize: 11,
  },
  cardActions: {
    justifyContent: 'space-between',
    gap: 6,
  },
  smallButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  smallDangerButton: {
    backgroundColor: '#dc2626',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  smallLinkedBadge: {
    backgroundColor: '#065f46',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  smallButtonText: {
    color: '#f9fafb',
    fontSize: 12,
    fontWeight: '700',
  },
  songsPanel: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 12,
    backgroundColor: '#0f172a',
    padding: 10,
  },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    paddingVertical: 8,
  },
  songTitle: {
    color: '#f9fafb',
    fontSize: 13,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#000000b0',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 14,
  },
});
