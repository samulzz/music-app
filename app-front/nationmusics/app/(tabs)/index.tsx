import { useState } from 'react';
import { StyleSheet, Text, View, TextInput, FlatList, Image, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export default function HomeScreen() {
  const [pesquisa, setPesquisa] = useState('');
  const [resultados, setResultados] = useState<any[]>([]);
  
  const [carregandoBusca, setCarregandoBusca] = useState(false);
  const [baixandoId, setBaixandoId] = useState<string | null>(null);

  const API_URL = 'https://pseudoprincely-plumular-nikolas.ngrok-free.dev/api/musicas';

  const buscarMusica = async () => {
    if (!pesquisa) return;

    setCarregandoBusca(true);
    console.log("Buscando no Spring Boot por:", pesquisa);

    try {
      const resposta = await fetch(`${API_URL}/buscar?q=${encodeURIComponent(pesquisa)}`);
      const dados = await resposta.json();
      setResultados(dados);
    } catch (erro) {
      console.error("Erro ao conectar na API:", erro);
      Alert.alert("Erro", "Falha na conexão com o servidor.");
    } finally {
      setCarregandoBusca(false);
    }
  };

  const baixarParaCelular = async (id: string, titulo: string) => {
    setBaixandoId(id);
    
    try {
      const nomeLimpo = titulo.replace(/[^a-zA-Z0-9 ]/g, "").trim();
      
      const caminhoDestino = FileSystem.documentDirectory + `${nomeLimpo}.mp3`;
      
      const urlDownload = `${API_URL}/baixar/${id}?titulo=${encodeURIComponent(nomeLimpo)}`;
      
      console.log(`Iniciando download: ${titulo}`);

      const { uri } = await FileSystem.downloadAsync(urlDownload, caminhoDestino);

      console.log('Download concluído! Salvo em:', uri);
      Alert.alert('Sucesso! 🎵', 'Música baixada e pronta para ouvir offline!');

    } catch (erro) {
      console.error("Erro no download:", erro);
      Alert.alert('Erro', 'Não foi possível baixar a música.');
    } finally {
      setBaixandoId(null);
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <Image source={{ uri: item.capa }} style={styles.capa} />
      
      <View style={styles.info}>
        <Text style={styles.tituloMusica} numberOfLines={2}>{item.titulo}</Text>
        <Text style={styles.artista} numberOfLines={1}>{item.artista}</Text>
      </View>

      <TouchableOpacity 
        style={styles.botaoBaixar} 
        onPress={() => baixarParaCelular(item.id, item.titulo)}
        disabled={baixandoId === item.id}
      >
        {baixandoId === item.id ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.textoBotao}>Baixar</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Nation 🌩</Text>

      <TextInput
        style={styles.input}
        placeholder="Digite o nome da música..."
        placeholderTextColor="#888"
        value={pesquisa}
        onChangeText={setPesquisa}
      />

      <TouchableOpacity 
        style={styles.botaoPesquisar} 
        onPress={buscarMusica}
        disabled={carregandoBusca}
      >
        {carregandoBusca ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.textoBotaoPesquisar}>Pesquisar</Text>
        )}
      </TouchableOpacity>

      <FlatList
        data={resultados}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ marginTop: 20, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
    backgroundColor: '#121212'
  },
  titulo: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1db954',
    marginBottom: 20,
    textAlign: 'center'
  },
  input: {
    backgroundColor: '#282828',
    color: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    fontSize: 16
  },
  botaoPesquisar: {
    backgroundColor: '#1db954',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    height: 50
  },
  textoBotaoPesquisar: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold'
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    alignItems: 'center'
  },
  capa: {
    width: 65,
    height: 65,
    borderRadius: 6,
    marginRight: 12
  },
  info: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 10
  },
  tituloMusica: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4
  },
  artista: {
    color: '#b3b3b3',
    fontSize: 12
  },
  botaoBaixar: {
    backgroundColor: '#1db954',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center'
  },
  textoBotao: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12
  }
});