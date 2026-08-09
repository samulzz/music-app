import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

type DownloadProgress = {
  done: number;
  total: number;
  currentTitle?: string;
  percent?: number;
  force?: boolean;
};

let prepared = false;
let progressNotificationId: string | null = null;
let lastProgressSignature = '';
let lastProgressAt = 0;

async function prepareNotifications() {
  if (prepared) return;
  prepared = true;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('downloads', {
      name: 'Downloads',
      importance: Notifications.AndroidImportance.HIGH,
      sound: undefined,
      vibrationPattern: [0],
    });
  }

  const permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) {
    await Notifications.requestPermissionsAsync();
  }
}

async function scheduleNotification(content: Notifications.NotificationContentInput) {
  await prepareNotifications();
  return Notifications.scheduleNotificationAsync({
    content: {
      sound: false,
      color: '#1db954',
      ...content,
      data: {
        kind: 'offline-download',
        ...(content.data || {}),
      },
    },
    trigger: null,
  });
}

async function replaceProgressNotification(content: Notifications.NotificationContentInput) {
  if (progressNotificationId) {
    await Notifications.dismissNotificationAsync(progressNotificationId).catch(() => {});
  }

  progressNotificationId = await scheduleNotification({
    sticky: true,
    autoDismiss: false,
    priority: Notifications.AndroidNotificationPriority.HIGH,
    ...content,
  });
}

async function clearProgressNotification() {
  if (!progressNotificationId) return;
  await Notifications.dismissNotificationAsync(progressNotificationId).catch(() => {});
  progressNotificationId = null;
}

function completedLabel(done: number, total: number) {
  const safeDone = Math.max(0, Math.min(done, total));
  return `${safeDone}/${total} concluída${total === 1 ? '' : 's'}`;
}

function percentLabel(percent?: number) {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return '';
  const safePercent = Math.max(0, Math.min(percent, 1));
  return `${Math.round(safePercent * 100)}%`;
}

export async function notifyDownloadStarted(total: number) {
  if (Platform.OS === 'android') return;
  try {
    lastProgressSignature = '';
    lastProgressAt = 0;
    await replaceProgressNotification({
      title: 'NationMusics baixando',
      subtitle: total === 1 ? 'Salvando música offline' : 'Salvando biblioteca offline',
      body: total === 1
        ? 'Preparando download...\nPuxe para baixo para ver o progresso.'
        : `${completedLabel(0, total)}\nPreparando downloads...\nPuxe para baixo para ver o progresso.`,
    });
  } catch {
    // Notificações são um extra; download não deve falhar se o sistema negar permissão.
  }
}

export async function notifyDownloadProgress({
  done,
  total,
  currentTitle,
  percent,
  force = false,
}: DownloadProgress) {
  if (Platform.OS === 'android') return;
  try {
    const progress = percentLabel(percent);
    const signature = `${done}|${total}|${currentTitle || ''}|${progress}`;
    const now = Date.now();

    if (!force && signature === lastProgressSignature) return;
    if (!force && progress !== '100%' && now - lastProgressAt < 1500) return;

    lastProgressSignature = signature;
    lastProgressAt = now;

    await replaceProgressNotification({
      title: 'Baixando para offline',
      subtitle: 'NationMusics',
      body: [
        `${completedLabel(done, total)}${progress ? ` • ${progress}` : ''}`,
        currentTitle ? `Agora: ${currentTitle}` : 'Preparando próxima música...',
        'Pode sair do app; o progresso aparece aqui.',
      ].join('\n'),
    });
  } catch {
    // Notificações são um extra; download não deve falhar se o sistema negar permissão.
  }
}

export async function notifyDownloadFinished(total: number, failures = 0) {
  if (Platform.OS === 'android') return;
  try {
    await clearProgressNotification();

    if (failures > 0) {
      await scheduleNotification({
        title: 'Downloads concluídos com pendências',
        body: `${total - failures}/${total} músicas foram salvas offline.`,
        priority: Notifications.AndroidNotificationPriority.DEFAULT,
        autoDismiss: true,
      });
      return;
    }

    await scheduleNotification({
      title: 'Downloads concluídos',
      body: total === 1
        ? 'A música já está disponível offline.'
        : `${total} músicas já estão disponíveis offline.`,
      priority: Notifications.AndroidNotificationPriority.DEFAULT,
      autoDismiss: true,
    });
  } catch {
    // Notificações são um extra; download não deve falhar se o sistema negar permissão.
  }
}
