import { type ComponentProps, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { clearSession, getSession } from '../services/auth';
import { stopMusicPlayer } from '../services/player';
import { getUserProfile, updateUserProfile, type UserProfile, type UserProfileUpdate } from '../services/user-profile';
import { clearOfflineLibrary, formatBytes, getDownloadStorageStats } from '../services/offline-library';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type SettingsTab = 'account' | 'privacy' | 'downloads';

const AVATAR_OPTIONS: { icon: IoniconName; label: string }[] = [
  { icon: 'person', label: 'Padrao' },
  { icon: 'musical-note', label: 'Musica' },
  { icon: 'headset', label: 'Fone' },
  { icon: 'radio', label: 'Radio' },
  { icon: 'star', label: 'Estrela' },
  { icon: 'heart', label: 'Favorito' },
  { icon: 'flame', label: 'Fogo' },
  { icon: 'moon', label: 'Noite' },
  { icon: 'planet', label: 'Planeta' },
  { icon: 'sparkles', label: 'Brilho' },
  { icon: 'disc', label: 'Disco' },
  { icon: 'flash', label: 'Raio' },
];

function fallbackProfile(username: string): UserProfile {
  return {
    username,
    avatarIcon: 'person',
    showOnlineStatus: true,
    showListeningActivity: true,
    showLastSeen: true,
    showActiveJam: true,
  };
}

function normalizeIcon(icon?: string): IoniconName {
  const found = AVATAR_OPTIONS.find((option) => option.icon === icon);
  return found?.icon || 'person';
}

export function UserMenu() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('account');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [username, setUsername] = useState('');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingField, setSavingField] = useState('');
  const [downloadStats, setDownloadStats] = useState({ count: 0, bytes: 0 });

  const activeTab = String(segments[1] || 'index');
  const buttonPlacement = useMemo(() => {
    const top = Math.max(insets.top, 0) + 10;
    if (activeTab === 'explore') return { top: top + 54, right: 16 };
    return { top, right: 16 };
  }, [activeTab, insets.top]);

  const currentProfile = profile || fallbackProfile(username);
  const currentIcon = normalizeIcon(currentProfile.avatarIcon);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    getSession()
      .then(async (session) => {
        if (cancelled) return;
        const nextUsername = session?.username || '';
        setUsername(nextUsername);
        try {
          const nextProfile = await getUserProfile();
          if (!cancelled) setProfile(nextProfile);
        } catch {
          if (!cancelled) setProfile(fallbackProfile(nextUsername));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const closeMenu = useCallback(() => {
    setVisible(false);
    setShowSettings(false);
    setSettingsTab('account');
    setShowAvatarPicker(false);
  }, []);

  const openMenu = useCallback(() => {
    setLoadingProfile(true);
    setVisible(true);
  }, []);

  const saveProfile = useCallback(async (patch: UserProfileUpdate, field: string) => {
    setSavingField(field);
    setProfile((current) => ({ ...(current || fallbackProfile(username)), ...patch }));
    try {
      const next = await updateUserProfile(patch);
      setProfile(next);
    } catch (error) {
      Alert.alert('Nao foi possivel salvar', error instanceof Error ? error.message : 'Tente novamente.');
      try {
        setProfile(await getUserProfile());
      } catch {}
    } finally {
      setSavingField('');
    }
  }, [username]);

  const logout = useCallback(() => {
    Alert.alert('Sair', 'As musicas baixadas continuam salvas neste celular.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          closeMenu();
          stopMusicPlayer(true);
          await clearSession();
          router.replace('/login');
        },
      },
    ]);
  }, [closeMenu, router]);

  const togglePrivacy = useCallback((key: keyof UserProfileUpdate, value: boolean) => {
    void saveProfile({ [key]: value }, key);
  }, [saveProfile]);

  const openDownloads = useCallback(() => {
    setSettingsTab('downloads');
    void getDownloadStorageStats().then(({ count, bytes }) => setDownloadStats({ count, bytes })).catch(() => {});
  }, []);

  const clearDownloads = useCallback(() => {
    Alert.alert('Limpar downloads', 'Os arquivos offline deste celular serão apagados.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Limpar', style: 'destructive', onPress: async () => {
        await clearOfflineLibrary();
        setDownloadStats({ count: 0, bytes: 0 });
      } },
    ]);
  }, []);

  return (
    <>
      <TouchableOpacity
        accessibilityLabel="Perfil"
        activeOpacity={0.82}
        style={[styles.floatingButton, buttonPlacement]}
        onPress={openMenu}
      >
        <Ionicons name={currentIcon} size={20} color="#1db954" />
      </TouchableOpacity>

      <Modal transparent visible={visible} animationType="fade" onRequestClose={closeMenu}>
        <Pressable style={styles.backdrop} onPress={closeMenu}>
          <Pressable style={styles.sheet}>
            <View style={styles.profileRow}>
              <TouchableOpacity
                accessibilityLabel="Alterar icone do perfil"
                activeOpacity={0.82}
                style={styles.avatar}
                onPress={() => setShowAvatarPicker((current) => !current)}
              >
                <Ionicons name={currentIcon} size={24} color="#1db954" />
                <View style={styles.avatarEditBadge}>
                  <Ionicons name="pencil" size={11} color="#121212" />
                </View>
              </TouchableOpacity>
              <View style={styles.profileText}>
                <Text style={styles.username} numberOfLines={1}>{currentProfile.username || username || 'Usuario'}</Text>
                <Text style={styles.subtitle}>NationMusics {Constants.expoConfig?.version || ''}</Text>
              </View>
              {loadingProfile ? <ActivityIndicator color="#1db954" /> : null}
            </View>

            {showAvatarPicker ? (
              <View style={styles.avatarPicker}>
                <Text style={styles.pickerTitle}>Escolha seu icone</Text>
                <View style={styles.avatarGrid}>
                  {AVATAR_OPTIONS.map((option) => {
                    const selected = currentIcon === option.icon;
                    return (
                      <TouchableOpacity
                        key={option.icon}
                        style={[styles.avatarChoice, selected && styles.avatarChoiceSelected]}
                        onPress={() => {
                          setShowAvatarPicker(false);
                          void saveProfile({ avatarIcon: option.icon }, 'avatarIcon');
                        }}
                      >
                        <Ionicons name={option.icon} size={21} color={selected ? '#121212' : '#ddd'} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {showSettings ? (
              <View style={styles.settingsPanel}>
                <View style={styles.settingsHeader}>
                  <TouchableOpacity style={styles.iconButton} onPress={() => setShowSettings(false)}>
                    <Ionicons name="chevron-back" size={20} color="#ddd" />
                  </TouchableOpacity>
                  <Text style={styles.settingsTitle}>Configuracoes</Text>
                </View>

                <View style={styles.tabRow}>
                  <TouchableOpacity
                    style={[styles.tabButton, settingsTab === 'account' && styles.tabButtonActive]}
                    onPress={() => setSettingsTab('account')}
                  >
                    <Text style={[styles.tabText, settingsTab === 'account' && styles.tabTextActive]}>Conta</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tabButton, settingsTab === 'privacy' && styles.tabButtonActive]}
                    onPress={() => setSettingsTab('privacy')}
                  >
                    <Text style={[styles.tabText, settingsTab === 'privacy' && styles.tabTextActive]}>Privacidade</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tabButton, settingsTab === 'downloads' && styles.tabButtonActive]}
                    onPress={openDownloads}
                  >
                    <Text style={[styles.tabText, settingsTab === 'downloads' && styles.tabTextActive]}>Downloads</Text>
                  </TouchableOpacity>
                </View>

                {settingsTab === 'account' ? (
                  <>
                    <View style={styles.settingRow}>
                      <Ionicons name="person-circle-outline" size={21} color="#1db954" />
                      <View style={styles.settingText}>
                        <Text style={styles.settingLabel}>Conta conectada</Text>
                        <Text style={styles.settingValue} numberOfLines={1}>{currentProfile.username || username || 'Usuario'}</Text>
                      </View>
                    </View>
                    <View style={styles.settingRow}>
                      <Ionicons name="cloud-done-outline" size={21} color="#1db954" />
                      <View style={styles.settingText}>
                        <Text style={styles.settingLabel}>Downloads</Text>
                        <Text style={styles.settingValue}>Musicas baixadas ficam salvas ao sair</Text>
                      </View>
                    </View>
                    <View style={styles.settingRow}>
                      <Ionicons name="shield-checkmark-outline" size={21} color="#1db954" />
                      <View style={styles.settingText}>
                        <Text style={styles.settingLabel}>Sessao</Text>
                        <Text style={styles.settingValue}>Login mantido por mais tempo neste aparelho</Text>
                      </View>
                    </View>
                  </>
                ) : settingsTab === 'privacy' ? (
                  <>
                    <PrivacySwitch
                      icon="radio-outline"
                      label="Mostrar online"
                      description="Amigos veem quando voce esta usando o app"
                      value={currentProfile.showOnlineStatus}
                      busy={savingField === 'showOnlineStatus'}
                      onValueChange={(value) => togglePrivacy('showOnlineStatus', value)}
                    />
                    <PrivacySwitch
                      icon="musical-notes-outline"
                      label="Mostrar musica"
                      description="Amigos veem ouvindo agora e ultima vez ouvindo"
                      value={currentProfile.showListeningActivity}
                      busy={savingField === 'showListeningActivity'}
                      onValueChange={(value) => togglePrivacy('showListeningActivity', value)}
                    />
                    <PrivacySwitch
                      icon="time-outline"
                      label="Mostrar ultimo visto"
                      description="Amigos veem quando voce abriu o app pela ultima vez"
                      value={currentProfile.showLastSeen}
                      busy={savingField === 'showLastSeen'}
                      onValueChange={(value) => togglePrivacy('showLastSeen', value)}
                    />
                    <PrivacySwitch
                      icon="people-outline"
                      label="Mostrar JAM"
                      description="Amigos veem e entram na sua JAM ativa"
                      value={currentProfile.showActiveJam}
                      busy={savingField === 'showActiveJam'}
                      onValueChange={(value) => togglePrivacy('showActiveJam', value)}
                    />
                  </>
                ) : (
                  <View style={styles.downloadManager}>
                    <Ionicons name="cloud-download-outline" size={34} color="#1db954" />
                    <Text style={styles.downloadTotal}>{downloadStats.count} música{downloadStats.count === 1 ? '' : 's'}</Text>
                    <Text style={styles.settingValue}>{formatBytes(downloadStats.bytes) || '0 MB'} usados neste celular</Text>
                    <TouchableOpacity style={styles.clearDownloadsButton} onPress={clearDownloads} disabled={!downloadStats.count}>
                      <Ionicons name="trash-outline" size={19} color={downloadStats.count ? '#ff8989' : '#666'} />
                      <Text style={[styles.clearDownloadsText, !downloadStats.count && { color: '#666' }]}>Limpar cache e downloads</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
              <>
                <TouchableOpacity style={styles.option} onPress={() => setShowSettings(true)}>
                  <Ionicons name="settings-outline" size={21} color="#ddd" />
                  <Text style={styles.optionText}>Configuracoes</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.option, styles.logoutOption]} onPress={logout}>
                  <Ionicons name="log-out-outline" size={21} color="#ff7373" />
                  <Text style={[styles.optionText, styles.logoutText]}>Sair</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.closeButton} onPress={closeMenu}>
                  <Text style={styles.closeText}>Fechar</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function PrivacySwitch({
  icon,
  label,
  description,
  value,
  busy,
  onValueChange,
}: {
  icon: IoniconName;
  label: string;
  description: string;
  value: boolean;
  busy: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.privacyRow}>
      <Ionicons name={icon} size={21} color="#1db954" />
      <View style={styles.settingText}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingValue}>{description}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color="#1db954" />
      ) : (
        <Switch
          value={value}
          onValueChange={onValueChange}
          thumbColor={value ? '#fff' : '#9a9a9a'}
          trackColor={{ true: '#1db954', false: '#3a3a3a' }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  floatingButton: {
    position: 'absolute',
    zIndex: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#1db95440',
    backgroundColor: '#171717',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 8,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.64)',
  },
  sheet: {
    margin: 14,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2b2b2b',
    backgroundColor: '#181818',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#292929',
    marginBottom: 8,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#1db95445',
    backgroundColor: '#1db95416',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#1db954',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: { flex: 1, minWidth: 0 },
  username: { color: '#fff', fontSize: 18, fontWeight: '900' },
  subtitle: { color: '#888', fontSize: 12, marginTop: 3 },
  avatarPicker: {
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#292929',
    marginBottom: 6,
  },
  pickerTitle: { color: '#ddd', fontSize: 13, fontWeight: '900' },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  avatarChoice: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#242424',
    borderWidth: 1,
    borderColor: '#333',
  },
  avatarChoiceSelected: {
    backgroundColor: '#1db954',
    borderColor: '#1db954',
  },
  option: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  logoutOption: { marginTop: 2 },
  optionText: { color: '#ddd', fontSize: 15, fontWeight: '800' },
  logoutText: { color: '#ff7373' },
  settingsPanel: { gap: 10, paddingTop: 2 },
  settingsHeader: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#242424',
  },
  settingsTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },
  tabRow: {
    height: 42,
    flexDirection: 'row',
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#202020',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  tabButtonActive: { backgroundColor: '#1db954' },
  tabText: { color: '#aaa', fontSize: 13, fontWeight: '900' },
  tabTextActive: { color: '#121212' },
  settingRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#202020',
  },
  privacyRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#202020',
  },
  settingText: { flex: 1, minWidth: 0 },
  settingLabel: { color: '#eee', fontSize: 14, fontWeight: '900' },
  settingValue: { color: '#969696', fontSize: 12, marginTop: 2 },
  downloadManager: { alignItems: 'center', gap: 7, padding: 18, borderRadius: 14, backgroundColor: '#202020' },
  downloadTotal: { color: '#fff', fontSize: 19, fontWeight: '900' },
  clearDownloadsButton: { marginTop: 12, minHeight: 44, paddingHorizontal: 16, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#2b2020' },
  clearDownloadsText: { color: '#ff8989', fontSize: 13, fontWeight: '900' },
  closeButton: {
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#242424',
  },
  closeText: { color: '#ddd', fontSize: 14, fontWeight: '900' },
});
