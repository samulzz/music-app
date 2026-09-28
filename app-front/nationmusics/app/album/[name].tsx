import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import GlobalMiniPlayer from '../../components/global-mini-player';
import { apiRequest } from '../../services/api';
import { addSongsToPlaybackQueue, playSongQueue } from '../../services/player';
import { fromApiSearchSong, type ApiSearchSong, type MusicSong } from '../../types/music';

export default function AlbumScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ name: string; artist?: string; coverUrl?: string; playlistId?: string }>();
  const albumName = typeof params.name === 'string' ? params.name.trim() : '';
  const artist = typeof params.artist === 'string' ? params.artist.trim() : '';
  const coverUrl = typeof params.coverUrl === 'string' ? params.coverUrl : '';
  const playlistId = typeof params.playlistId === 'string' ? params.playlistId.trim() : '';
  const [songs, setSongs] = useState<MusicSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ name: albumName, artist });
    if (playlistId) query.set('playlistId', playlistId);
    apiRequest<ApiSearchSong[]>(`/catalog/albums/songs?${query.toString()}`)
      .then((data) => { if (active) setSongs(data.map(fromApiSearchSong)); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o álbum.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [albumName, artist, playlistId]);

  const play = useCallback(async (index: number) => {
    try {
      await playSongQueue(songs, index, 'playlist', { type: 'album', id: playlistId || albumName, name: albumName });
    } catch (reason) {
      Alert.alert('Não foi possível reproduzir', reason instanceof Error ? reason.message : 'Tente novamente.');
    }
  }, [albumName, playlistId, songs]);

  const artwork = coverUrl || songs.find((song) => song.artworkUrl)?.artworkUrl;
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}><TouchableOpacity onPress={() => router.back()} accessibilityLabel="Voltar" style={styles.back}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity><Text style={styles.topTitle}>Álbum</Text></View>
      <FlatList
        data={songs}
        keyExtractor={(song, index) => `${song.sourceId || song.id}:${index}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<>
          <View style={styles.hero}>
            {artwork ? <Image source={{ uri: artwork }} style={styles.heroCover} /> : <View style={[styles.heroCover, styles.placeholder]}><Ionicons name="disc" size={70} color="#1db954" /></View>}
            <Text style={styles.eyebrow}>ÁLBUM</Text><Text style={styles.name}>{albumName}</Text>
            <Text style={styles.count}>{artist ? `${artist} • ` : ''}{songs.length} {songs.length === 1 ? 'música' : 'músicas'}</Text>
          </View>
          {songs.length > 0 && <TouchableOpacity style={styles.playAll} onPress={() => play(0)}><Ionicons name="play" size={22} color="#07140b" /><Text style={styles.playAllText}>Tocar álbum</Text></TouchableOpacity>}
          {loading && <ActivityIndicator color="#1db954" style={styles.loading} />}
          {Boolean(error) && <Text style={styles.notice}>{error}</Text>}
          {!loading && !error && !songs.length && <Text style={styles.notice}>Nenhuma música disponível deste álbum.</Text>}
        </>}
        renderItem={({ item, index }) => <TouchableOpacity style={styles.songRow} onPress={() => play(index)} onLongPress={() => Alert.alert(item.title, 'O que deseja fazer?', [
          { text: 'Adicionar à fila', onPress: () => { void addSongsToPlaybackQueue([item]); } },
          { text: 'Reproduzir agora', onPress: () => { void play(index); } },
          { text: 'Cancelar', style: 'cancel' },
        ])}>
          <Text style={styles.trackNumber}>{index + 1}</Text>
          <View style={styles.songMeta}><Text style={styles.songTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.songArtist} numberOfLines={1}>{item.artist}</Text></View><Ionicons name="play" size={19} color="#1db954" />
        </TouchableOpacity>}
      />
      <GlobalMiniPlayer bottomOffset={12 + Math.max(insets.bottom, 0)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#121212' },
  topBar: { height: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: '#aaa', fontWeight: '700', marginLeft: 8 },
  list: { paddingHorizontal: 18, paddingBottom: 185 },
  hero: { alignItems: 'center', paddingTop: 20, paddingBottom: 20 },
  heroCover: { width: 206, height: 206, borderRadius: 12, marginBottom: 22 },
  placeholder: { backgroundColor: '#252525', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#1db954', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  name: { color: '#fff', fontSize: 28, fontWeight: '900', textAlign: 'center', marginTop: 5 },
  count: { color: '#888', fontSize: 13, marginTop: 6 },
  playAll: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minWidth: 170, height: 48, borderRadius: 24, backgroundColor: '#1db954', marginBottom: 24 },
  playAllText: { color: '#07140b', fontWeight: '900' },
  loading: { marginTop: 35 },
  notice: { color: '#aaa', textAlign: 'center', marginTop: 32 },
  songRow: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: '#292929' },
  trackNumber: { width: 26, color: '#777', textAlign: 'center', fontWeight: '700' },
  songMeta: { flex: 1 },
  songTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  songArtist: { color: '#888', fontSize: 12, marginTop: 3 },
});
