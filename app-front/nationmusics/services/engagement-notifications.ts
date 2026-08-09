import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const STORAGE_KEY = 'nationmusics.engagement.dailyNotificationId';
export const DAILY_MIX_NOTIFICATION_KIND = 'daily-mix-ready';

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
