import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { getSession } from '../services/auth';
import {
  DAILY_MIX_NOTIFICATION_KIND,
  scheduleDailyMixNotification,
} from '../services/engagement-notifications';

function openNotification(response: Notifications.NotificationResponse | null) {
  if (response?.notification.request.content.data?.kind !== DAILY_MIX_NOTIFICATION_KIND) return;
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
        if (active && session?.token) return scheduleDailyMixNotification();
      })
      .catch(() => {});

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (active) openNotification(response);
      })
      .catch(() => {});

    const subscription = Notifications.addNotificationResponseReceivedListener(openNotification);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return null;
}
