import { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function ExploreScreen() {
  const [musicas, setMusicas] = useState<any[]>([]);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  
  const [indiceAtual, setIndiceAtual] = useState<number | null>(null);
  const [tocando, setTocando] = useState(false);
  const [aleatorio, setAleatorio] = useState(false);

  const musicasRef = useRef(musicas);
  const indiceAtualRef = useRef(indiceAtual);
  const aleatorioRef = useRef(aleatorio);

  useEffect(() => { musicasRef.current = musicas; }, [musicas]);
  useEffect(() => { indiceAtualRef.current = indiceAtual; }, [indiceAtual]);
  useEffect(() => { aleatorioRef.current = aleatorio; }, [aleatorio]);
  
  useFocusEffect(
    useCallback(() => {
      carregarMusicas();
    }, [])
  );

  const configurarAudio = async () => {
    try {
      await Audio.setAudioModeAsync({
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (e) {
      console.log("Erro ao configurar áudio:", e);
    }
  };

  const carregarMusicas = async () => {
    try {
      const pasta = FileSystem.documentDirectory;
      if (!pasta) return;

      const arquivos = await FileSystem.readDirectoryAsync(pasta);
      const mp3Files = arquivos
        .filter(arquivo => arquivo.endsWith('.mp3'))
        .map((arquivo, index) => ({
          id: String(index),
          nome: arquivo.replace('.mp3', ''),
          uri: pasta + arquivo,
        }));

      setMusicas(mp3Files);
    } catch (error) {
      console.error("Erro ao carregar músicas:", error);
    }
  };

  useEffect(() => {
    configurarAudio();
    carregarMusicas();
  }, []);

  const tocarIndice = async (index: number) => {
    const lista = musicasRef.current;
    if (index < 0 || index >= lista.length) return;

    if (sound) {
      await sound.unloadAsync();
    }

    const musica = lista[index];
    setIndiceAtual(index);
    setTocando(true);

    const { sound: novoSound } = await Audio.Sound.createAsync(
      { uri: musica.uri },
      { shouldPlay: true },
      onPlaybackStatusUpdate
    );
    
    setSound(novoSound);
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.didJustFinish) {
      avancarMusica();
    }
  };

  const avancarMusica = () => {
    const lista = musicasRef.current;
    const atual = indiceAtualRef.current;
    const modoAleatorio = aleatorioRef.current;

    if (lista.length === 0) return;

    let proximoIndice = 0;

    if (modoAleatorio) {
      do {
        proximoIndice = Math.floor(Math.random() * lista.length);
      } while (proximoIndice === atual && lista.length > 1);
    } else {
      proximoIndice = atual !== null ? (atual + 1) % lista.length : 0;
    }

    tocarIndice(proximoIndice);
  };

  const voltarMusica = () => {
    const lista = musicasRef.current;
    const atual = indiceAtualRef.current;

    if (lista.length === 0 || atual === null) return;

    const anteriorIndice = (atual - 1 + lista.length) % lista.length;
    tocarIndice(anteriorIndice);
  };

  const pausarOuRetomar = async () => {
    if (!sound) return;
    if (tocando) {
      await sound.pauseAsync();
      setTocando(false);
    } else {
      await sound.playAsync();
      setTocando(true);
    }
  };

  useEffect(() => {
    return sound ? () => { sound.unloadAsync(); } : undefined;
  }, [sound]);

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const isTocandoAgora = index === indiceAtual;

    return (
      <TouchableOpacity 
        style={[styles.card, isTocandoAgora && styles.cardAtivo]} 
        onPress={() => tocarIndice(index)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconeMusica, isTocandoAgora && styles.iconeMusicaAtivo]}>
          <Ionicons 
            name={isTocandoAgora ? "musical-notes" : "musical-note"} 
            size={20} 
            color={isTocandoAgora ? "#1db954" : "#b3b3b3"} 
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.nomeMusica, isTocandoAgora && styles.textoAtivo]} numberOfLines={1}>
            {item.nome}
          </Text>
        </View>
        {isTocandoAgora && <Ionicons name="volume-medium" size={20} color="#1db954" style={{ marginLeft: 10 }} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Sua Biblioteca</Text>

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
        contentContainerStyle={{ paddingBottom: 130 }} 
      />

      {}
      {indiceAtual !== null && musicas[indiceAtual] && (
        <View style={styles.playerContainer}>
          <Text style={styles.playerTexto} numberOfLines={1}>
            {musicas[indiceAtual].nome}
          </Text>
          
          <View style={styles.controles}>
            <TouchableOpacity onPress={() => setAleatorio(!aleatorio)} style={styles.botaoControle}>
              <Ionicons name="shuffle" size={24} color={aleatorio ? "#1db954" : "#666"} />
            </TouchableOpacity>

            <TouchableOpacity onPress={voltarMusica} style={styles.botaoControle}>
              <Ionicons name="play-skip-back" size={28} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.botaoPlayPause} onPress={pausarOuRetomar}>
              <Ionicons 
                name={tocando ? "pause" : "play"} 
                size={28} 
                color="#121212" 
                style={{ marginLeft: tocando ? 0 : 4 }}
              />
            </TouchableOpacity>

            <TouchableOpacity onPress={avancarMusica} style={styles.botaoControle}>
              <Ionicons name="play-skip-forward" size={28} color="#fff" />
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
  vazioContainer: { alignItems: 'center', marginTop: 60 },
  textoVazio: { color: '#b3b3b3', marginTop: 15, fontSize: 16 },
  
  card: { flexDirection: 'row', backgroundColor: '#121212', borderRadius: 8, paddingVertical: 12, marginBottom: 5, alignItems: 'center' },
  cardAtivo: { backgroundColor: '#2a2a2a', paddingHorizontal: 10, borderRadius: 10 },
  iconeMusica: { backgroundColor: '#282828', width: 45, height: 45, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 15 },
  iconeMusicaAtivo: { backgroundColor: '#1db95420' },
  nomeMusica: { color: '#fff', fontSize: 16, fontWeight: '500' },
  textoAtivo: { color: '#1db954', fontWeight: 'bold' },
  
  playerContainer: {
    position: 'absolute',
    bottom: 20, 
    left: 10,
    right: 10,
    backgroundColor: '#282828',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  playerTexto: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', width: '100%' },
  controles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', width: '100%' },
  botaoControle: { padding: 10 },
  botaoPlayPause: { backgroundColor: '#fff', width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
});