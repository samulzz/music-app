import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';

import { getSession } from '../services/auth';

export default function Index() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    getSession()
      .then((session) => setAuthenticated(Boolean(session?.token)))
      .catch(() => setAuthenticated(false));
  }, []);

  if (authenticated === null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1db954" />
        <Text style={styles.text}>Preparando sua biblioteca...</Text>
      </View>
    );
  }

  return <Redirect href={authenticated ? '/(tabs)' : '/login'} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  text: { color: '#8a8a8a', fontSize: 13 },
});
