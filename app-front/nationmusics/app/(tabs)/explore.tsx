import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import TrackPlayer, { State, usePlaybackState, useActiveTrack } from 'react-native-track-player';

export default function ExploreScreen() {
  const [musicas, setMusicas] = useState<any[]>([]);

  const estadoPlayer = usePlaybackState();
  const musicaAtual = useActiveTrack();
  
  const tocando = estadoPlayer.state === State.Playing;

  const carregarMusicas = async () => {
    try {
      const pasta = FileSystem.documentDirectory;
      if (!pasta) return;

      const arquivos = await FileSystem.readDirectoryAsync(pasta);
      
      const tracks = arquivos
        .filter(arquivo => arquivo.endsWith('.mp3'))
        .map((arquivo, index) => ({
          id: String(index),
          url: pasta + arquivo,
          title: arquivo.replace('.mp3', ''),
          artist: 'SoulSeeker Offline',
        }));

      setMusicas(tracks);

      await TrackPlayer.reset();
      if (tracks.length > 0) {
        await TrackPlayer.add(tracks);
      }
    } catch (error) {
      console.error("Erro ao carregar músicas:", error);
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
    if (tocando) {
      await TrackPlayer.pause();
    } else {
      await TrackPlayer.play();
    }
  };

  const avancarMusica = async () => await TrackPlayer.skipToNext();
  const voltarMusica = async () => await TrackPlayer.skipToPrevious();

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const isTocandoAgora = musicaAtual?.id === item.id; 

    return (
      <TouchableOpacity 
        style={[styles.card, isTocandoAgora && styles.cardAtivo]} 
        onPress={() => tocarMusica(index)}
      >
        <View style={styles.iconeMusica}>
          <Text style={styles.iconeTexto}>{isTocandoAgora ? '🔊' : '🎵'}</Text>
        </View>
        <Text style={[styles.nomeMusica, isTocandoAgora && styles.textoAtivo]} numberOfLines={1}>
          {item.title}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Músicas Baixadas 💾</Text>
      
      <TouchableOpacity style={styles.botaoAtualizar} onPress={carregarMusicas}>
        <Text style={styles.textoBotaoAtualizar}>🔄 Atualizar Lista</Text>
      </TouchableOpacity>

      <FlatList
        data={musicas}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={
          <Text style={styles.textoVazio}>Sua biblioteca está vazia.</Text>
        }
        contentContainerStyle={{ paddingBottom: 130 }} 
      />

      {}
      {musicaAtual && (
        <View style={styles.playerContainer}>
          <Text style={styles.playerTexto} numberOfLines={1}>
            {musicaAtual.title}
          </Text>
          
          <View style={styles.controles}>
            {}
            <TouchableOpacity onPress={voltarMusica} style={styles.botaoControle}>
              <Text style={styles.iconeControle}>⏮️</Text>
            </TouchableOpacity>

            {}
            <TouchableOpacity style={styles.botaoPlayPause} onPress={pausarOuRetomar}>
              <Text style={styles.textoPlayPause}>{tocando ? '⏸' : '▶️'}</Text>
            </TouchableOpacity>

            {}
            <TouchableOpacity onPress={avancarMusica} style={styles.botaoControle}>
              <Text style={styles.iconeControle}>⏭️</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 20, backgroundColor: '#121212' },
  titulo: { fontSize: 28, fontWeight: 'bold', color: '#1db954', marginBottom: 15, textAlign: 'center' },
  botaoAtualizar: { backgroundColor: '#282828', padding: 10, borderRadius: 8, alignItems: 'center', marginBottom: 20 },
  textoBotaoAtualizar: { color: '#fff', fontSize: 14 },
  textoVazio: { color: '#888', textAlign: 'center', marginTop: 50, fontSize: 16 },
  card: { flexDirection: 'row', backgroundColor: '#1e1e1e', borderRadius: 8, padding: 15, marginBottom: 10, alignItems: 'center' },
  cardAtivo: { borderColor: '#1db954', borderWidth: 1, backgroundColor: '#183321' },
  iconeMusica: { backgroundColor: '#333', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 15 },
  iconeTexto: { fontSize: 18 },
  nomeMusica: { color: '#fff', fontSize: 16, flex: 1 },
  textoAtivo: { color: '#1db954', fontWeight: 'bold' },
  playerContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#1a1a1a', borderTopWidth: 1, borderTopColor: '#333', padding: 15, paddingBottom: 25, borderTopLeftRadius: 20, borderTopRightRadius: 20, alignItems: 'center', elevation: 10 },
  playerTexto: { color: '#1db954', fontSize: 16, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', width: '100%' },
  controles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', width: '100%', paddingHorizontal: 40 },
  botaoControle: { padding: 10 },
  iconeControle: { fontSize: 24, color: '#fff' },
  botaoPlayPause: { backgroundColor: '#1db954', width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  textoPlayPause: { color: '#fff', fontSize: 24, lineHeight: 26, marginLeft: 4 }
});