import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { apiRequest } from './api';
import { getSession } from './auth';
import { checkForRequiredUpdate } from './update-manager';

const STORAGE_KEY = 'nationmusics.engagement.dailyNotificationId';
export const DAILY_MIX_NOTIFICATION_KIND = 'daily-mix-ready';
export const UPDATE_NOTIFICATION_KIND = 'app-update';
export const CATALOG_NOTIFICATION_KIND = 'catalog-growth';
const CATALOG_BASELINE_KEY = 'nationmusics.notifications.catalogBaseline';
const UPDATE_SEEN_KEY = 'nationmusics.notifications.updateSeen';
const LARGE_CATALOG_BATCH = 50;
let lastDiscoveryCheck = 0;

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isEngagement = notification.request.content.data?.kind === DAILY_MIX_NOTIFICATION_KIND;
    return {
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: !isEngagement,
      shouldShowList: !isEngagement,
    };
  },
});

async function prepareDiscoveryChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('discoveries', {
    name: 'Novidades e recomendações',
    description: 'Avisos sobre novas seleções e recomendações pessoais.',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
    vibrationPattern: [0, 250, 150, 250],
  });
}

async function ensurePermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function scheduleDailyMixNotification() {
  await prepareDiscoveryChannel();
  if (!(await ensurePermission())) return false;

  const savedId = await AsyncStorage.getItem(STORAGE_KEY);
  if (savedId) {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    if (scheduled.some((item) => item.identifier === savedId)) return true;
  }

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Seu Top 100 de hoje chegou 🎧',
      body: 'Uma nova seleção baseada no que você ouve está esperando no NationMusics.',
      sound: 'default',
      color: '#1db954',
      data: {
        kind: DAILY_MIX_NOTIFICATION_KIND,
        route: '/playlist/daily',
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 10,
      minute: 30,
      channelId: Platform.OS === 'android' ? 'discoveries' : undefined,
    },
  });
  await AsyncStorage.setItem(STORAGE_KEY, identifier);
  return true;
}

export async function checkDiscoveryNotifications() {
  if (Date.now() - lastDiscoveryCheck < 15 * 60 * 1000) return;
  const session = await getSession();
  if (!session?.token) return;
  lastDiscoveryCheck = Date.now();
  if (!(await ensurePermission())) return;
  await prepareDiscoveryChannel();

  const update = await checkForRequiredUpdate();
  if (update.required && update.target) {
    const release = `${update.target.version || ''}:${update.target.versionCode || ''}`;
    const seen = await AsyncStorage.getItem(UPDATE_SEEN_KEY);
    if (release !== seen) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Nova atualização do NationMusics',
          body: update.target.releaseNotes || 'Atualize o aplicativo para continuar ouvindo.',
          sound: 'default',
          data: { kind: UPDATE_NOTIFICATION_KIND, route: '/update' },
        },
        trigger: null,
      });
      await AsyncStorage.setItem(UPDATE_SEEN_KEY, release);
    }
  }

  try {
    const stats = await apiRequest<{ totalSongs: number }>('/songs/stats');
    const current = Number(stats.totalSongs);
    if (!Number.isFinite(current)) return;
    const stored = await AsyncStorage.getItem(CATALOG_BASELINE_KEY);
    const baseline = stored === null ? current : Number(stored);
    if (current < baseline || stored === null) {
      await AsyncStorage.setItem(CATALOG_BASELINE_KEY, String(current));
    } else if (current - baseline >= LARGE_CATALOG_BATCH) {
      const added = current - baseline;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${added} músicas novas chegaram 🎧`,
          body: 'Explore as novidades no catálogo do NationMusics.',
          sound: 'default',
          data: { kind: CATALOG_NOTIFICATION_KIND, route: '/search' },
        },
        trigger: null,
      });
      await AsyncStorage.setItem(CATALOG_BASELINE_KEY, String(current));
    }
  } catch {
    // Uma falha temporária de rede não altera a contagem de referência.
  }
}
