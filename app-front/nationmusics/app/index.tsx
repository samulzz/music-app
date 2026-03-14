import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Index() {
  const [logado, setLogado] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('userToken')
      .then((token) => setLogado(!!token))
      .catch(() => setLogado(false));
  }, []);

  if (logado === null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1db954" />
      </View>
    );
  }

  return <Redirect href={logado ? '/(tabs)' : ('/login' as any)} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
  },
});