import { useEffect, useState } from 'react';
import { Alert, Modal, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../services/api';
import type { ApiPlaylist, MusicSong } from '../types/music';

const listeners = new Set<(songs: MusicSong[]) => void>();
export function addSongToPlaylist(song: MusicSong | MusicSong[]) { listeners.forEach(listener => listener(Array.isArray(song) ? song : [song])); }

export function PlaylistPicker() {
  const [song, setSong] = useState<MusicSong | null>(null);
  const [selected, setSelected] = useState<MusicSong[]>([]);
  const [playlists, setPlaylists] = useState<ApiPlaylist[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const open = (next: MusicSong[]) => {
      setSelected(next); setSong(next[0]); setPlaylists([]); setBusy(true);
      apiRequest<ApiPlaylist[]>('/playlists/personal').then(setPlaylists)
        .catch(error => { setSong(null); Alert.alert('Não foi possível carregar', error.message); })
        .finally(() => setBusy(false));
    };
    listeners.add(open); return () => { listeners.delete(open); };
  }, []);
  const pick = async (playlist: ApiPlaylist) => {
    if (!song || busy) return;
    setBusy(true);
    try {
      await apiRequest(`/playlists/personal/${playlist.id}/songs`, { method: 'POST', json: true, body: JSON.stringify({ songIds: selected.map(item => Number(item.id)) }) });
      setSong(null); Alert.alert('Adicionada', `Música adicionada a ${playlist.name}.`);
    } catch (error) { Alert.alert('Não foi possível adicionar', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setBusy(false); }
  };
  return <Modal visible={Boolean(song)} transparent animationType="fade" onRequestClose={() => setSong(null)}>
    <View style={{ flex: 1, backgroundColor: '#000b', justifyContent: 'center', padding: 24 }}>
      <View style={{ backgroundColor: '#202020', borderRadius: 20, padding: 20, maxHeight: '75%' }}>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 12 }}>Adicionar à playlist</Text>
        <Text style={{ color: '#aaa', marginBottom: 12 }}>{song?.title}</Text>
        <FlatList data={playlists} keyExtractor={item => String(item.id)}
          ListEmptyComponent={<Text style={{ color: '#aaa' }}>{busy ? 'Carregando...' : 'Crie uma playlist na Biblioteca primeiro.'}</Text>}
          renderItem={({ item }) => <TouchableOpacity disabled={busy} onPress={() => void pick(item)} style={{ paddingVertical: 16 }}><Text style={{ color: '#fff', fontSize: 17 }}>{item.name}</Text></TouchableOpacity>} />
        <TouchableOpacity onPress={() => setSong(null)} style={{ paddingTop: 20 }}><Text style={{ color: '#1db954' }}>Cancelar</Text></TouchableOpacity>
      </View>
    </View>
  </Modal>;
}
