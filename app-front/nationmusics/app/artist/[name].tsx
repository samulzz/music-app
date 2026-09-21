import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import GlobalMiniPlayer from '../../components/global-mini-player';
import { apiRequest } from '../../services/api';
import { playSongQueue } from '../../services/player';
import { fromApiSearchSong, type ApiSearchSong, type MusicSong } from '../../types/music';

export default function ArtistScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { name } = useLocalSearchParams<{ name: string }>();
  const artistName = typeof name === 'string' ? name.trim() : '';
  const [songs, setSongs] = useState<MusicSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!artistName) return;
    apiRequest<ApiSearchSong[]>(`/songs/artist?name=${encodeURIComponent(artistName)}`)
      .then((data) => { if (active) setSongs(data.map(fromApiSearchSong)); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as músicas.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [artistName]);

  const play = useCallback(async (index: number) => {
    try { await playSongQueue(songs, index, 'playlist'); }
    catch (reason) { Alert.alert('Não foi possível reproduzir', reason instanceof Error ? reason.message : 'Tente novamente.'); }
  }, [songs]);

  const artwork = songs.find((song) => song.artworkUrl)?.artworkUrl;
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}><TouchableOpacity onPress={() => router.back()} accessibilityLabel="Voltar" style={styles.back}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity><Text style={styles.topTitle} numberOfLines={1}>Artista</Text></View>
      <FlatList
        data={songs}
        keyExtractor={(song, index) => `${song.sourceId || song.id}:${index}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<>
          <View style={styles.hero}>
            {artwork ? <Image source={{ uri: artwork }} style={styles.heroCover} /> : <View style={[styles.heroCover, styles.placeholder]}><Ionicons name="person" size={66} color="#1db954" /></View>}
            <Text style={styles.eyebrow}>ARTISTA</Text><Text style={styles.name}>{artistName}</Text><Text style={styles.count}>{songs.length} {songs.length === 1 ? 'música' : 'músicas'} no catálogo</Text>
          </View>
          {songs.length > 0 && <TouchableOpacity style={styles.playAll} onPress={() => play(0)}><Ionicons name="play" size={22} color="#07140b" /><Text style={styles.playAllText}>Tocar músicas</Text></TouchableOpacity>}
          {loading && <ActivityIndicator color="#1db954" style={styles.loading} />}
          {Boolean(error) && <Text style={styles.notice}>{error}</Text>}
          {!loading && !error && !songs.length && <Text style={styles.notice}>Nenhuma música disponível deste artista.</Text>}
        </>}
        renderItem={({ item, index }) => <TouchableOpacity style={styles.songRow} onPress={() => play(index)}>
          {item.artworkUrl ? <Image source={{ uri: item.artworkUrl }} style={styles.cover} /> : <View style={[styles.cover, styles.placeholder]}><Ionicons name="musical-note" size={21} color="#777" /></View>}
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
  heroCover: { width: 196, height: 196, borderRadius: 98, marginBottom: 22 },
  placeholder: { backgroundColor: '#252525', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#1db954', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  name: { color: '#fff', fontSize: 29, fontWeight: '900', textAlign: 'center', marginTop: 5 },
  count: { color: '#888', fontSize: 13, marginTop: 6 },
  playAll: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minWidth: 176, height: 48, borderRadius: 24, backgroundColor: '#1db954', marginBottom: 24 },
  playAllText: { color: '#07140b', fontWeight: '900' },
  loading: { marginTop: 35 },
  notice: { color: '#aaa', textAlign: 'center', marginTop: 32 },
  songRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: '#292929' },
  cover: { width: 50, height: 50, borderRadius: 7 },
  songMeta: { flex: 1 },
  songTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  songArtist: { color: '#888', fontSize: 12, marginTop: 3 },
});
