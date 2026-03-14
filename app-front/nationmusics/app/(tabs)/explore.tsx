import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import TrackPlayer, { State, useTrackPlayerEvents, Event } from 'react-native-track-player';

export default function ExploreScreen() {
  const [musicas, setMusicas] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [tocando, setTocando] = useState(false);
  const [musicaAtual, setMusicaAtual] = useState<any>(null);

  useTrackPlayerEvents([Event.PlaybackState, Event.PlaybackActiveTrackChanged], async (event) => {
    if (event.type === Event.PlaybackState) {
      setTocando(event.state === State.Playing);
    }
    if (event.type === Event.PlaybackActiveTrackChanged) {
      if (event.track) {
        setMusicaAtual(event.track);
      }
    }
  });

  const carregarMusicas = async () => {
    setCarregando(true);
    try {
      const pasta = FileSystem.documentDirectory;
      if (!pasta) return;

      const arquivos = await FileSystem.readDirectoryAsync(pasta);
      
      const tracks = arquivos
        .filter(arquivo => arquivo.endsWith('.mp3'))
        .map((arquivo, index) => ({
          id: arquivo, 
          url: pasta + arquivo,
          title: arquivo.replace('.mp3', ''),
          artist: 'SoulSeeker',
          artwork: 'https://cdn-icons-png.flaticon.com/512/26/26805.png', 
        }));

      setMusicas(tracks);

      await TrackPlayer.reset();
      if (tracks.length > 0) {
        await TrackPlayer.add(tracks);
      }
    } catch (error) {
      console.error("Erro ao carregar:", error);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarMusicas();
  }, []);

  const tocarMusica = async (index: number) => {
    await TrackPlayer.skip(index);
    await TrackPlayer.play();
  };

  const pausarOuRetomar = async () => {
    const state = await TrackPlayer.getPlaybackState();
    if (state.state === State.Playing) {
      await TrackPlayer.pause();
    } else {
      await TrackPlayer.play();
    }
  };

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const isTocandoAgora = musicaAtual?.id === item.id; 

    return (
      <TouchableOpacity 
        style={[styles.card, isTocandoAgora && styles.cardAtivo]} 
        onPress={() => tocarMusica(index)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconeMusica, isTocandoAgora && styles.iconeMusicaAtivo]}>
          <Ionicons name={isTocandoAgora ? "musical-notes" : "musical-note"} size={20} color={isTocandoAgora ? "#1db954" : "#b3b3b3"} />
        </View>
        <View style={styles.textosMusica}>
          <Text style={[styles.nomeMusica, isTocandoAgora && styles.textoAtivo]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.artistaMusica}>{item.artist}</Text>
        </View>
        {isTocandoAgora && <Ionicons name="volume-medium" size={20} color="#1db954" style={{ marginLeft: 10 }} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Sua Biblioteca</Text>
      
      <TouchableOpacity style={styles.botaoAtualizar} onPress={carregarMusicas}>
        <Ionicons name="sync" size={16} color="#fff" style={{ marginRight: 8 }} />
        <Text style={styles.textoBotaoAtualizar}>Atualizar Lista</Text>
      </TouchableOpacity>

      {carregando ? (
        <ActivityIndicator size="large" color="#1db954" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={musicas}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.vazioContainer}>
              <Ionicons name="folder-open-outline" size={48} color="#444" />
              <Text style={styles.textoVazio}>Nenhuma música baixada.</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 100 }} 
        />
      )}

      {}
      {musicaAtual && (
        <View style={styles.floatingPlayer}>
          <View style={styles.playerInfo}>
            <View style={styles.capaPequena}>
              <Ionicons name="disc" size={24} color="#1db954" />
            </View>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.playerTitulo} numberOfLines={1}>{musicaAtual.title}</Text>
              <Text style={styles.playerSubtitulo} numberOfLines={1}>{musicaAtual.artist}</Text>
            </View>
          </View>
          
          <View style={styles.playerControles}>
            <TouchableOpacity onPress={async () => await TrackPlayer.skipToPrevious()} style={styles.btnControle}>
              <Ionicons name="play-skip-back" size={24} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity onPress={pausarOuRetomar} style={styles.btnControlePrincipal}>
              <Ionicons name={tocando ? "pause" : "play"} size={26} color="#121212" style={{ marginLeft: tocando ? 0 : 3 }} />
            </TouchableOpacity>

            <TouchableOpacity onPress={async () => await TrackPlayer.skipToNext()} style={styles.btnControle}>
              <Ionicons name="play-skip-forward" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 16, backgroundColor: '#121212' },
  titulo: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 20 },
  botaoAtualizar: { flexDirection: 'row', backgroundColor: '#282828', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 20, alignSelf: 'flex-start', alignItems: 'center', marginBottom: 20 },
  textoBotaoAtualizar: { color: '#fff', fontSize: 14, fontWeight: '600' },
  vazioContainer: { alignItems: 'center', marginTop: 60 },
  textoVazio: { color: '#b3b3b3', marginTop: 15, fontSize: 16 },
  card: { flexDirection: 'row', backgroundColor: '#121212', borderRadius: 8, paddingVertical: 12, marginBottom: 5, alignItems: 'center' },
  cardAtivo: { backgroundColor: '#2a2a2a', paddingHorizontal: 10, borderRadius: 10 },
  iconeMusica: { backgroundColor: '#282828', width: 45, height: 45, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 15 },
  iconeMusicaAtivo: { backgroundColor: '#1db95420' },
  textosMusica: { flex: 1, justifyContent: 'center' },
  nomeMusica: { color: '#fff', fontSize: 16, fontWeight: '500', marginBottom: 4 },
  artistaMusica: { color: '#b3b3b3', fontSize: 14 },
  textoAtivo: { color: '#1db954', fontWeight: 'bold' },
  floatingPlayer: { position: 'absolute', bottom: 20, left: 10, right: 10, backgroundColor: '#282828', borderRadius: 12, flexDirection: 'row', alignItems: 'center', padding: 10, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4 },
  playerInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  capaPequena: { backgroundColor: '#1a1a1a', width: 40, height: 40, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  playerTitulo: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  playerSubtitulo: { color: '#b3b3b3', fontSize: 13 },
  playerControles: { flexDirection: 'row', alignItems: 'center' },
  btnControle: { padding: 10 },
  btnControlePrincipal: { backgroundColor: '#fff', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginHorizontal: 5 }
});