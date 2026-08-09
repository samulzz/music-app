import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  checkForRequiredUpdate,
  openUpdateDownload,
  type UpdateCheckResult,
} from '../services/update-manager';

type Props = {
  children: ReactNode;
};

export function MandatoryUpdateGate({ children }: Props) {
  const [checking, setChecking] = useState(true);
  const [opening, setOpening] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);

  const runCheck = useCallback(async () => {
    setChecking(true);
    const nextResult = await checkForRequiredUpdate('android');
    setResult(nextResult);
    setChecking(false);
  }, []);

  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  const updateNow = useCallback(async () => {
    if (!result) return;
    setOpening(true);
    try {
      await openUpdateDownload(result);
    } finally {
      setOpening(false);
    }
  }, [result]);

  if (checking && !result) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1db954" />
          <Text style={styles.muted}>Verificando atualizacao...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!result?.required) {
    return <>{children}</>;
  }

  const version = result.target?.version || 'nova versao';
  const message = result.target?.message || 'Existe uma atualizacao obrigatoria para continuar usando o NationMusics.';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.panel}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>N</Text>
        </View>
        <Text style={styles.title}>Atualizacao obrigatoria</Text>
        <Text style={styles.description}>{message}</Text>
        <View style={styles.versionBox}>
          <Text style={styles.versionLabel}>Sua versao</Text>
          <Text style={styles.versionValue}>
            {result.currentVersion}
            {typeof result.currentVersionCode === 'number' ? ` (${result.currentVersionCode})` : ''}
          </Text>
          <Text style={styles.versionLabel}>Nova versao</Text>
          <Text style={styles.versionValue}>
            {version}
            {typeof result.target?.versionCode === 'number' ? ` (${result.target.versionCode})` : ''}
          </Text>
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={updateNow} disabled={opening}>
          {opening ? <ActivityIndicator color="#06130b" /> : <Text style={styles.primaryText}>Atualizar agora</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={runCheck} disabled={checking}>
          <Text style={styles.secondaryText}>{checking ? 'Verificando...' : 'Tentar novamente'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#101010',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  muted: {
    color: '#a0a0a0',
    fontSize: 14,
    fontWeight: '700',
  },
  panel: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 36,
  },
  logo: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
    borderRadius: 18,
    backgroundColor: '#1db954',
  },
  logoText: {
    color: '#06130b',
    fontSize: 28,
    fontWeight: '900',
  },
  title: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 12,
  },
  description: {
    color: '#cfcfcf',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  versionBox: {
    gap: 6,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2c2c2c',
    borderRadius: 14,
    backgroundColor: '#181818',
  },
  versionLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  versionValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
  },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#1db954',
  },
  primaryText: {
    color: '#06130b',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    borderRadius: 13,
    backgroundColor: '#242424',
  },
  secondaryText: {
    color: '#d8d8d8',
    fontSize: 14,
    fontWeight: '800',
  },
});
