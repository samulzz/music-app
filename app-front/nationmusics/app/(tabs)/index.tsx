import { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TextInput, FlatList, Image,
  TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, Platform, StatusBar,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const BASE_URL = 'https://pseudoprincely-plumular-nikolas.ngrok-free.dev/api';
const API_KEY = 'NationMusics_SecretAppKey_2026';
const NGROK_BYPASS = 'true';

type SearchResult = {
  id: string;
  titulo: string;
  artista: string;
  capa: string;
};

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [username, setUsername] = useState('');

  useEffect(() => {
    AsyncStorage.getItem('username').then((u) => { if (u) setUsername(u); });
  }, []);

  const getHeaders = async (includeJson = false) => {
    const rawToken = (await AsyncStorage.getItem('userToken'))?.trim() ?? '';
    if (!rawToken) throw new Error('Sessao expirada. Faca login novamente.');
    const token = rawToken.startsWith('Bearer ') ? rawToken.slice(7).trim() : rawToken;
    return {
      'X-API-KEY': API_KEY,
      'Authorization': `Bearer ${token}`,
      'ngrok-skip-browser-warning': NGROK_BYPASS,
      'Accept': 'application/json',
      ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    };
  };

  const buscar = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setResults([]);
    try {
      const headers = await getHeaders();
      const res = await fetch(`${BASE_URL}/musicas/buscar?q=${encodeURIComponent(q)}`, { headers });
      if (res.status === 401 || res.status === 403) {
        throw new Error('Sessao invalida no servidor. Faça login novamente e tente buscar de novo.');
      }
      if (!res.ok) throw new Error('Erro na busca. Verifique sua conexão.');
      const data = await res.json();
      setResults(data);
      if (data.length === 0) Alert.alert('Sem resultados', `Nenhuma música encontrada para "${q}".`);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setSearching(false);
    }
  };

  const baixar = async (item: SearchResult) => {
    setDownloadingId(item.id);
    try {
      const nomeLimpo = item.titulo.replace(/[^a-zA-Z0-9 ]/g, '').trim();
      const destino = FileSystem.documentDirectory + `${nomeLimpo}.mp3`;
      const urlDownload = `${BASE_URL}/musicas/baixar/${item.id}?titulo=${encodeURIComponent(nomeLimpo)}`;

      const headers = await getHeaders();
      const { uri } = await FileSystem.downloadAsync(urlDownload, destino, { headers });

      const saveHeaders = await getHeaders(true);
      const saveRes = await fetch(`${BASE_URL}/songs/save`, {
        method: 'POST',
        headers: saveHeaders,
        body: JSON.stringify({
          title: item.titulo,
          artist: item.artista,
          uri,
          coverUrl: item.capa,
          sourceId: item.id,
        }),
      });

      if (saveRes.status === 401 || saveRes.status === 403) {
        throw new Error('Sessao invalida. Faca login novamente.');
      }
      if (!saveRes.ok) throw new Error('Download OK, mas não foi possível salvar na nuvem.');

      setDownloadedIds((prev) => new Set(prev).add(item.id));
      Alert.alert('Salvo! 🎵', `"${item.titulo}" está na sua biblioteca.`);
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível baixar a música.');
    } finally {
      setDownloadingId(null);
    }
  };

  const renderResult = ({ item }: { item: SearchResult }) => {
    const downloaded = downloadedIds.has(item.id);
    const isLoading = downloadingId === item.id;

    return (
      <View style={styles.card}>
        {item.capa
          ? <Image source={{ uri: item.capa }} style={styles.cover} />
          : (
            <View style={styles.coverPlaceholder}>
              <Ionicons name="musical-note" size={24} color="#444" />
            </View>
          )
        }
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.titulo}</Text>
          <Text style={styles.cardArtist} numberOfLines={1}>{item.artista}</Text>
        </View>
        <TouchableOpacity
          style={[styles.btnDownload, downloaded && styles.btnDownloaded]}
          onPress={() => !downloaded && baixar(item)}
          disabled={isLoading || downloaded}
          activeOpacity={0.8}
        >
          {isLoading
            ? <ActivityIndicator size="small" color="#fff" />
            : downloaded
              ? <Ionicons name="checkmark" size={18} color="#1db954" />
              : <Ionicons name="arrow-down-circle-outline" size={20} color="#fff" />
          }
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Olá, {username || 'músico'} 👋</Text>
            <Text style={styles.headerTitle}>O que vai ouvir hoje?</Text>
          </View>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={20} color="#1db954" />
          </View>
        </View>

        {/* Search bar */}
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color="#666" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar músicas, artistas..."
              placeholderTextColor="#555"
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              onSubmitEditing={buscar}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(''); setResults([]); }}>
                <Ionicons name="close-circle" size={18} color="#555" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.searchBtn, searching && { opacity: 0.7 }]}
            onPress={buscar}
            disabled={searching}
            activeOpacity={0.85}
          >
            {searching
              ? <ActivityIndicator size="small" color="#121212" />
              : <Text style={styles.searchBtnText}>Buscar</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Results */}
        {results.length === 0 && !searching ? (
          <View style={styles.emptyState}>
            <Ionicons name="musical-notes-outline" size={64} color="#2a2a2a" />
            <Text style={styles.emptyTitle}>Descubra músicas</Text>
            <Text style={styles.emptySubtitle}>Pesquise pelo título ou artista e baixe para ouvir offline.</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={renderResult}
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#121212', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  container: { flex: 1, paddingHorizontal: 18 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 24,
  },
  greeting: { fontSize: 13, color: '#888', marginBottom: 2 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1db95420',
    borderWidth: 1,
    borderColor: '#1db95440',
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2c2c2c',
    paddingHorizontal: 14,
    height: 48,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 15 },
  searchBtn: {
    backgroundColor: '#1db954',
    borderRadius: 10,
    height: 48,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtnText: { color: '#121212', fontWeight: 'bold', fontSize: 14 },

  card: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#242424',
  },
  cover: { width: 58, height: 58, borderRadius: 8, marginRight: 12 },
  coverPlaceholder: {
    width: 58,
    height: 58,
    borderRadius: 8,
    backgroundColor: '#242424',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardInfo: { flex: 1 },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  cardArtist: { color: '#888', fontSize: 12 },
  btnDownload: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1db954',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDownloaded: { backgroundColor: '#1db95420', borderWidth: 1, borderColor: '#1db95440' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyTitle: { color: '#444', fontSize: 18, fontWeight: '600', marginTop: 20, marginBottom: 8 },
  emptySubtitle: { color: '#333', fontSize: 13, textAlign: 'center', paddingHorizontal: 30 },
});