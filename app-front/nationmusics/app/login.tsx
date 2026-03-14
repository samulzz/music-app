import { useState } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const BASE_URL = 'https://pseudoprincely-plumular-nikolas.ngrok-free.dev/api/auth';
const API_KEY = 'NationMusics_SecretAppKey_2026';
const NGROK_BYPASS = 'true';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const router = useRouter();

  const autenticar = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Atenção', 'Preencha o usuário e a senha!');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/${mode}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': API_KEY,
          'ngrok-skip-browser-warning': NGROK_BYPASS,
          'Accept': 'application/json',
        },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Falha na autenticação.');
      }

      if (mode === 'login') {
        const data = await res.json();
        const rawToken = (data?.token ?? '').toString().trim();
        const normalizedToken = rawToken.startsWith('Bearer ')
          ? rawToken.slice(7).trim()
          : rawToken;
        await AsyncStorage.setItem('userToken', normalizedToken);
        await AsyncStorage.setItem('username', data.username);
        router.replace('/(tabs)');
      } else {
        Alert.alert('Conta criada! 🎉', 'Agora entre com seus dados.', [
          { text: 'OK', onPress: () => setMode('login') },
        ]);
      }
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível conectar ao servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Logo */}
          <View style={styles.logoArea}>
            <View style={styles.logoCircle}>
              <Ionicons name="musical-notes" size={48} color="#1db954" />
            </View>
            <Text style={styles.appName}>NationMusics</Text>
            <Text style={styles.tagline}>Sua música, em qualquer lugar.</Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {mode === 'login' ? 'Bem-vindo de volta' : 'Criar nova conta'}
            </Text>

            {/* Username */}
            <View style={styles.inputRow}>
              <Ionicons name="person-outline" size={18} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Nome de usuário"
                placeholderTextColor="#555"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            {/* Password */}
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color="#666" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Senha"
                placeholderTextColor="#555"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={autenticar}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#666" />
              </TouchableOpacity>
            </View>

            {/* Primary button */}
            <TouchableOpacity
              style={[styles.btnPrimary, loading && { opacity: 0.7 }]}
              onPress={autenticar}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#121212" />
                : <Text style={styles.btnPrimaryText}>{mode === 'login' ? 'Entrar' : 'Criar Conta'}</Text>
              }
            </TouchableOpacity>

            {/* Toggle mode */}
            <TouchableOpacity
              style={styles.btnToggle}
              onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
              disabled={loading}
            >
              <Text style={styles.btnToggleText}>
                {mode === 'login'
                  ? 'Não tem conta? '
                  : 'Já tem conta? '}
                <Text style={styles.btnToggleHighlight}>
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
  safe: { flex: 1, backgroundColor: '#121212' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },

  logoArea: { alignItems: 'center', marginBottom: 40 },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#1db95415',
    borderWidth: 2,
    borderColor: '#1db95440',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  appName: { fontSize: 32, fontWeight: 'bold', color: '#fff', letterSpacing: 0.5 },
  tagline: { fontSize: 14, color: '#666', marginTop: 6 },

  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 24 },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#242424',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 14,
    marginBottom: 14,
    height: 52,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: '#fff', fontSize: 15 },
  eyeBtn: { padding: 4 },

  btnPrimary: {
    backgroundColor: '#1db954',
    borderRadius: 10,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  btnPrimaryText: { color: '#121212', fontSize: 16, fontWeight: 'bold', letterSpacing: 0.3 },

  btnToggle: { marginTop: 20, alignItems: 'center' },
  btnToggleText: { color: '#777', fontSize: 14 },
  btnToggleHighlight: { color: '#1db954', fontWeight: '600' },
});