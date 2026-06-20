import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { apiRequest } from '../services/api';
import { downloadSong } from '../services/offline-library';
import type {
  ApiSearchSong,
  MusicSong,
  SpotifyImportTrack,
  SpotifyPlaylistPreview,
} from '../types/music';
import { fromApiSearchSong } from '../types/music';

type TrackStatus = 'pending' | 'searching' | 'downloading' | 'done' | 'error';

type ImportRow = SpotifyImportTrack & {
  status: TrackStatus;
  progress: number;
  message?: string;
};

// O VPS tem CPU/RAM limitados; uma conversão por vez evita travamentos.
const WORKERS = 1;

export default function SpotifyImportScreen() {
  const router = useRouter();
  const cancelled = useRef(false);
  const [url, setUrl] = useState('');
  const [playlist, setPlaylist] = useState<SpotifyPlaylistPreview | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const updateRow = (spotifyId: string, patch: Partial<ImportRow>) => {
    setRows((current) => current.map((row) =>
      row.spotifyId === spotifyId ? { ...row, ...patch } : row
    ));
  };

  const preview = async () => {
    if (!url.trim()) {
      Alert.alert('Cole o link', 'Informe o link público da playlist do Spotify.');
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest<SpotifyPlaylistPreview>('/spotify/playlist/preview', {
        method: 'POST',
        json: true,
        body: JSON.stringify({ url: url.trim() }),
      });
      setPlaylist(data);
      setRows(data.tracks.map((track) => ({ ...track, status: 'pending', progress: 0 })));
    } catch (error) {
      Alert.alert('Não foi possível importar', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const processTrack = async (track: SpotifyImportTrack) => {
    updateRow(track.spotifyId, { status: 'searching', message: 'Localizando no YouTube...' });
    try {
      const query = `${track.title} ${track.artist} áudio oficial`;
      const results = await apiRequest<ApiSearchSong[]>(
        `/musicas/buscar?q=${encodeURIComponent(query)}`
      );
      if (!results.length) throw new Error('Não encontrada');

      const song: MusicSong = fromApiSearchSong(results[0]);
      updateRow(track.spotifyId, { status: 'downloading', progress: 0, message: 'Baixando...' });
      const offlineSong = await downloadSong(song, ({ bytesWritten, totalBytes }) => {
        if (totalBytes > 0) {
          updateRow(track.spotifyId, {
            progress: Math.min(bytesWritten / totalBytes, 1),
          });
        }
      });

      try {
        await apiRequest<void>('/songs/save', {
          method: 'POST',
          json: true,
          body: JSON.stringify({
            title: offlineSong.title,
            artist: offlineSong.artist,
            uri: offlineSong.localUri,
            coverUrl: offlineSong.artworkUrl,
            sourceId: offlineSong.sourceId,
          }),
        });
      } catch {}

      updateRow(track.spotifyId, {
        status: 'done',
        progress: 1,
        message: 'Disponível offline',
      });
    } catch (error) {
      updateRow(track.spotifyId, {
        status: 'error',
        message: error instanceof Error ? error.message : 'Falhou',
      });
    }
  };

  const downloadAll = async () => {
    if (!playlist || importing) return;
    cancelled.current = false;
    setImporting(true);
    setRows((current) => current.map((row) =>
      row.status === 'done' ? row : { ...row, status: 'pending', progress: 0, message: undefined }
    ));

    let cursor = 0;
    const tracks = playlist.tracks;
    const worker = async () => {
      while (!cancelled.current) {
        const index = cursor;
        cursor += 1;
        if (index >= tracks.length) return;
        await processTrack(tracks[index]);
      }
    };

    await Promise.all(Array.from({ length: Math.min(WORKERS, tracks.length) }, worker));
    setImporting(false);
    if (!cancelled.current) {
      Alert.alert('Importação finalizada', 'As músicas concluídas já estão na sua Biblioteca.');
    }
  };

  const doneCount = rows.filter((row) => row.status === 'done').length;
  const failedCount = rows.filter((row) => row.status === 'error').length;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Importar do Spotify</Text>
            <Text style={styles.subtitle}>Até 50 faixas por playlist pública.</Text>
          </View>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="https://open.spotify.com/playlist/..."
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!importing}
          />
          <TouchableOpacity
            style={[styles.previewButton, (loading || importing) && styles.disabled]}
            onPress={preview}
            disabled={loading || importing}
          >
            {loading ? <ActivityIndicator color="#121212" /> : <Text style={styles.previewText}>Carregar</Text>}
          </TouchableOpacity>
        </View>

        {playlist && (
          <>
            <View style={styles.playlistHeader}>
              {playlist.coverUrl ? (
                <Image source={{ uri: playlist.coverUrl }} style={styles.playlistCover} />
              ) : (
                <View style={styles.playlistCoverPlaceholder}>
                  <Ionicons name="musical-notes" size={26} color="#1db954" />
                </View>
              )}
              <View style={styles.playlistInfo}>
                <Text style={styles.playlistName} numberOfLines={2}>{playlist.name}</Text>
                <Text style={styles.counter}>
                  {doneCount}/{rows.length} baixadas{failedCount ? ` • ${failedCount} falharam` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.downloadAll, importing && styles.stopButton]}
                onPress={() => {
                  if (importing) cancelled.current = true;
                  else void downloadAll();
                }}
              >
                <Ionicons name={importing ? 'stop' : 'download'} size={20} color="#121212" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={rows}
              keyExtractor={(item) => item.spotifyId}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item, index }) => (
                <View style={styles.track}>
                  <Text style={styles.trackNumber}>{index + 1}</Text>
                  <View style={styles.trackInfo}>
                    <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.trackArtist} numberOfLines={1}>{item.artist}</Text>
                    {item.status === 'downloading' && (
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${item.progress * 100}%` }]} />
                      </View>
                    )}
                    {item.message && <Text style={styles.statusText} numberOfLines={1}>{item.message}</Text>}
                  </View>
                  {item.status === 'done' ? (
                    <Ionicons name="checkmark-circle" size={22} color="#1db954" />
                  ) : item.status === 'error' ? (
                    <Ionicons name="alert-circle" size={22} color="#d55" />
                  ) : item.status !== 'pending' ? (
                    <ActivityIndicator size="small" color="#1db954" />
                  ) : (
                    <Ionicons name="time-outline" size={20} color="#666" />
                  )}
                </View>
              )}
            />
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#121212' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 10 },
  backButton: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#222',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  headerText: { flex: 1 },
  title: { color: '#fff', fontSize: 23, fontWeight: '800' },
  subtitle: { color: '#777', fontSize: 12, marginTop: 2 },
  form: { flexDirection: 'row', gap: 9, padding: 18 },
  input: {
    flex: 1, height: 50, borderRadius: 12, borderWidth: 1, borderColor: '#333',
    backgroundColor: '#202020', color: '#fff', paddingHorizontal: 13, fontSize: 13,
  },
  previewButton: {
    height: 50, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#1db954',
    alignItems: 'center', justifyContent: 'center',
  },
  previewText: { color: '#121212', fontWeight: '800' },
  disabled: { opacity: 0.6 },
  playlistHeader: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 18, marginBottom: 12,
    backgroundColor: '#1b1b1b', borderWidth: 1, borderColor: '#2d2d2d',
    borderRadius: 14, padding: 11,
  },
  playlistCover: { width: 58, height: 58, borderRadius: 9 },
  playlistCoverPlaceholder: {
    width: 58, height: 58, borderRadius: 9, backgroundColor: '#242424',
    alignItems: 'center', justifyContent: 'center',
  },
  playlistInfo: { flex: 1, marginHorizontal: 11 },
  playlistName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  counter: { color: '#888', fontSize: 11, marginTop: 5 },
  downloadAll: {
    width: 43, height: 43, borderRadius: 22, backgroundColor: '#1db954',
    alignItems: 'center', justifyContent: 'center',
  },
  stopButton: { backgroundColor: '#e8a64d' },
  list: { paddingHorizontal: 18, paddingBottom: 30 },
  track: {
    minHeight: 70, flexDirection: 'row', alignItems: 'center', backgroundColor: '#191919',
    borderBottomWidth: 1, borderBottomColor: '#292929', paddingHorizontal: 11, paddingVertical: 9,
  },
  trackNumber: { width: 26, color: '#666', fontSize: 12 },
  trackInfo: { flex: 1, marginRight: 9 },
  trackTitle: { color: '#eee', fontSize: 13, fontWeight: '600' },
  trackArtist: { color: '#888', fontSize: 11, marginTop: 3 },
  statusText: { color: '#6f9278', fontSize: 10, marginTop: 4 },
  progressTrack: { height: 3, backgroundColor: '#333', borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: '#1db954' },
});
