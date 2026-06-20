import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { apiRequest } from '../services/api';
import { saveSession } from '../services/auth';

type LoginResponse = {
  token: string;
  username: string;
};

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const router = useRouter();

  const authenticate = async () => {
    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password) {
      Alert.alert('Atenção', 'Preencha o usuário e a senha.');
      return;
    }

    setLoading(true);
    try {
      const data = await apiRequest<LoginResponse>(`/auth/${mode}`, {
        method: 'POST',
        authenticated: false,
        json: true,
        body: JSON.stringify({ username: normalizedUsername, password }),
      });

      const token = data?.token?.replace(/^Bearer\s+/i, '').trim();
      if (!token) throw new Error('O servidor não retornou uma sessão válida.');

      await saveSession({
        token,
        username: data.username || normalizedUsername,
        lastSuccessfulLoginAt: Date.now(),
      });
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert(
        'Não foi possível entrar',
        error instanceof Error ? error.message : 'Verifique a conexão e tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoArea}>
            <View style={styles.logoCircle}>
              <Ionicons name="musical-notes" size={46} color="#1db954" />
            </View>
            <Text style={styles.appName}>NationMusics</Text>
            <Text style={styles.tagline}>Sua música continua, até sem internet.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {mode === 'login' ? 'Bem-vindo de volta' : 'Criar nova conta'}
            </Text>

            <View style={styles.inputRow}>
              <Ionicons name="person-outline" size={18} color="#777" />
              <TextInput
                style={styles.input}
                placeholder="Nome de usuário"
                placeholderTextColor="#666"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color="#777" />
              <TextInput
                style={styles.input}
                placeholder="Senha"
                placeholderTextColor="#666"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={authenticate}
              />
              <TouchableOpacity onPress={() => setShowPassword((value) => !value)} style={styles.eye}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color="#777" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.disabled]}
              onPress={authenticate}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#121212" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {mode === 'login' ? 'Entrar' : 'Criar conta'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toggleButton}
              onPress={() => setMode((value) => value === 'login' ? 'register' : 'login')}
              disabled={loading}
            >
              <Text style={styles.toggleText}>
                {mode === 'login' ? 'Não tem conta? ' : 'Já tem conta? '}
                <Text style={styles.toggleHighlight}>
                  {mode === 'login' ? 'Cadastre-se' : 'Entre agora'}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#121212' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 40 },
  logoArea: { alignItems: 'center', marginBottom: 36 },
  logoCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#1db95418',
    borderWidth: 2,
    borderColor: '#1db95450',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  appName: { fontSize: 31, fontWeight: '800', color: '#fff' },
  tagline: { color: '#777', fontSize: 13, marginTop: 7 },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2b2b2b',
    padding: 22,
  },
  cardTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 22 },
  inputRow: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#242424',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#353535',
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  input: { flex: 1, color: '#fff', fontSize: 15 },
  eye: { padding: 4 },
  primaryButton: {
    height: 52,
    borderRadius: 11,
    backgroundColor: '#1db954',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
  },
  primaryButtonText: { color: '#121212', fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.65 },
  toggleButton: { marginTop: 19, alignItems: 'center' },
  toggleText: { color: '#888', fontSize: 14 },
  toggleHighlight: { color: '#1db954', fontWeight: '700' },
});
