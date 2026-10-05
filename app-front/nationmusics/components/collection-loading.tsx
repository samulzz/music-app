import { StyleSheet, Text, View } from 'react-native';

export function CollectionLoading({ label = 'Carregando músicas...', hero = false }: { label?: string; hero?: boolean }) {
  return <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={label}>
    <Text style={styles.label}>{label}</Text>
    {hero && <View style={styles.hero} />}
    {Array.from({ length: 5 }, (_, index) => <View key={index} style={styles.row} accessible={false}>
      <View style={styles.cover} /><View style={styles.copy}><View style={styles.title} /><View style={styles.subtitle} /></View>
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  container: { width: '100%', paddingVertical: 20, gap: 14 },
  label: { color: '#929a95', fontSize: 13, marginBottom: 6 },
  hero: { height: 160, backgroundColor: '#1c2420', borderRadius: 20, marginBottom: 12 },
  row: { height: 66, flexDirection: 'row', alignItems: 'center', gap: 14 },
  cover: { width: 54, height: 54, borderRadius: 10, backgroundColor: '#222825' },
  copy: { flex: 1, gap: 10 },
  title: { width: '72%', height: 13, borderRadius: 6, backgroundColor: '#252d28' },
  subtitle: { width: '45%', height: 10, borderRadius: 5, backgroundColor: '#1e2521' },
});
