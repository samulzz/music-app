import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';
import { router } from 'expo-router';

import { getSession } from '../services/auth';
import {
  DAILY_MIX_NOTIFICATION_KIND,
  UPDATE_NOTIFICATION_KIND,
  CATALOG_NOTIFICATION_KIND,
  checkDiscoveryNotifications,
  scheduleDailyMixNotification,
} from '../services/engagement-notifications';
import { checkForRequiredUpdate, openUpdateDownload } from '../services/update-manager';

function openNotification(response: Notifications.NotificationResponse | null) {
  const kind = response?.notification.request.content.data?.kind;
  if (kind === UPDATE_NOTIFICATION_KIND) {
    void checkForRequiredUpdate().then(openUpdateDownload).catch(() => {});
    return;
  }
  if (kind === CATALOG_NOTIFICATION_KIND) {
    router.push('/(tabs)/search');
    return;
  }
  if (kind !== DAILY_MIX_NOTIFICATION_KIND) return;
  router.push({
    pathname: '/playlist/[id]',
    params: { id: 'daily', title: 'Seu Top 100', kind: 'daily' },
  });
}

export function EngagementNotifications() {
  useEffect(() => {
    let active = true;
    getSession()
      .then((session) => {
        if (active && session?.token) {
          void checkDiscoveryNotifications().catch(() => {});
          return scheduleDailyMixNotification();
        }
      })
      .catch(() => {});

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (active) openNotification(response);
      })
      .catch(() => {});

    const subscription = Notifications.addNotificationResponseReceivedListener(openNotification);
    const appState = AppState.addEventListener('change', (status) => {
      if (status === 'active') void checkDiscoveryNotifications().catch(() => {});
    });
    return () => {
      active = false;
      subscription.remove();
      appState.remove();
    };
  }, []);

  return null;
}
