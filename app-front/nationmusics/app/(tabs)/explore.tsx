import { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';

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

    console.log(`Tocando agora [${index + 1}/${lista.length}]: ${musica.nome}`);

    const { sound: novoSound } = await Audio.Sound.createAsync(
      { uri: musica.uri },
      { shouldPlay: true },
      onPlaybackStatusUpdate
    );
    
    setSound(novoSound);
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.didJustFinish) {
      console.log("Música acabou! Puxando a próxima...");
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
      >
        <View style={styles.iconeMusica}>
          <Text style={styles.iconeTexto}>{isTocandoAgora ? '🔊' : '🎵'}</Text>
        </View>
        <Text style={[styles.nomeMusica, isTocandoAgora && styles.textoAtivo]} numberOfLines={1}>
          {item.nome}
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

      {indiceAtual !== null && musicas[indiceAtual] && (
        <View style={styles.playerContainer}>
          <Text style={styles.playerTexto} numberOfLines={1}>
            {musicas[indiceAtual].nome}
          </Text>
          
          <View style={styles.controles}>
            <TouchableOpacity onPress={() => setAleatorio(!aleatorio)} style={styles.botaoControle}>
              <Text style={{ fontSize: 20, opacity: aleatorio ? 1 : 0.3 }}>🔀</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={voltarMusica} style={styles.botaoControle}>
              <Text style={styles.iconeControle}>⏮️</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.botaoPlayPause} onPress={pausarOuRetomar}>
              <Text style={styles.textoPlayPause}>{tocando ? '⏸' : '▶️'}</Text>
            </TouchableOpacity>

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
  
  playerContainer: {
    position: 'absolute',
    bottom: 0, 
    left: 0,
    right: 0,
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
    padding: 15,
    paddingBottom: 25,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    alignItems: 'center',
    elevation: 10, // Sombra no Android
  },
  playerTexto: { color: '#1db954', fontSize: 16, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', width: '100%' },
  
  controles: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 20,
  },
  botaoControle: { padding: 10 },
  iconeControle: { fontSize: 24, color: '#fff' },
  
  botaoPlayPause: { backgroundColor: '#1db954', width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  textoPlayPause: { color: '#fff', fontSize: 24, lineHeight: 26, marginLeft: 4 } // margin left alinha visualmente o icone de play
});