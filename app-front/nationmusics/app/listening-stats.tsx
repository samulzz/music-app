import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getListeningCapsule, type ListeningCapsule, type StatsRank } from '../services/listening-stats';

export default function ListeningStatsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ month?: string }>();
  const [month, setMonth] = useState(params.month || '');
  const [data, setData] = useState<ListeningCapsule | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true; setData(null); setError('');
    getListeningCapsule(month).then(value => { if (alive) setData(value); })
      .catch(() => { if (alive) setError('Não foi possível carregar sua cápsula.'); });
    return () => { alive = false; };
  }, [month, retry]);
  const ranks = (title: string, items: StatsRank[]) => <View style={styles.card}>
    <Text style={styles.section}>{title}</Text>
    {items.map((item, i) => <View key={item.name + item.subtitle} style={styles.row}>
      <Text style={styles.rank}>{i + 1}</Text><View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        {item.subtitle ? <Text style={styles.muted} numberOfLines={1}>{item.subtitle}</Text> : null}
      </View><Text style={styles.muted}>{item.minutes < 1 ? '<1' : item.minutes} min</Text>
    </View>)}
  </View>;
  return <SafeAreaView style={styles.screen}>
    <View style={styles.header}><TouchableOpacity onPress={() => router.back()} accessibilityLabel="Voltar">
      <Ionicons name="chevron-back" size={26} color="#fff" /></TouchableOpacity><Text style={styles.section}>Sua cápsula sonora</Text></View>
    {!data && !error ? <ActivityIndicator color="#1db954" style={{ marginTop: 60 }} /> : null}
    {error ? <TouchableOpacity onPress={() => setRetry(retry + 1)} style={styles.card}><Text style={styles.name}>{error}</Text><Text style={styles.muted}>Toque para tentar novamente</Text></TouchableOpacity> : null}
    {data ? <ScrollView contentContainerStyle={styles.content}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {data.availableMonths.map(value => <TouchableOpacity key={value} onPress={() => setMonth(value)} style={[styles.chip, value === data.month && styles.activeChip]}>
          <Text style={styles.name}>{new Date(`${value}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}</Text>
        </TouchableOpacity>)}
      </ScrollView>
      <View style={styles.hero}><Text style={styles.muted}>{data.complete ? 'SEU MÊS EM MÚSICA' : 'MÊS EM ANDAMENTO'}</Text>
        <Text style={styles.title}>{data.label}</Text><Text style={styles.minutes}>{data.minutes.toLocaleString('pt-BR')}</Text>
        <Text style={styles.name}>minutos ouvindo</Text>
        <View style={styles.metrics}><Text style={styles.muted}>{data.songs} músicas</Text><Text style={styles.muted}>{data.artists} artistas</Text><Text style={styles.muted}>{data.activeDays} dias</Text></View>
      </View>
      {data.seconds > 0 ? <>{ranks('Seus artistas', data.topArtists)}{ranks('Músicas em destaque', data.topSongs)}{ranks('Seu ritmo: gêneros', data.topGenres)}</> :
        <View style={styles.card}><Text style={styles.name}>Sua história começa com o próximo play</Text><Text style={styles.muted}>Ouça músicas para preencher sua cápsula deste mês.</Text></View>}
      <Text style={styles.footnote}>Só conta o tempo efetivamente reproduzido. Ao encerrar o mês, esta cápsula permanece no histórico. O registro começa nesta atualização; os meses anteriores não têm dados detalhados.</Text>
    </ScrollView> : null}
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b100e' }, header: { padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  content: { padding: 20, gap: 16, paddingBottom: 130 }, section: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  hero: { padding: 24, backgroundColor: '#123524', borderRadius: 24, gap: 12 }, title: { color: '#fff', fontSize: 30, fontWeight: '900', textTransform: 'capitalize' },
  minutes: { color: '#5ee898', fontSize: 64, fontWeight: '900' }, metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginTop: 12 },
  card: { backgroundColor: '#17201b', padding: 20, borderRadius: 20, gap: 8 }, muted: { color: '#a7b8ac', fontSize: 13 },
  name: { color: '#fff', fontSize: 15, fontWeight: '700', textTransform: 'capitalize' }, row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowText: { flex: 1, gap: 4 }, rank: { color: '#5ee898', fontSize: 22, width: 24, fontWeight: '800' },
  chip: { padding: 12, borderRadius: 20, backgroundColor: '#17201b' }, activeChip: { backgroundColor: '#23603d' }, footnote: { color: '#93a198', fontSize: 12, lineHeight: 19 },
});
