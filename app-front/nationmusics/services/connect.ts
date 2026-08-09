import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { apiRequest } from './api';

export type ConnectSong = {
  id: string;
  sourceId?: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  remoteUrl?: string;
};

export type ConnectDevice = {
  deviceId: string;
  deviceName: string;
  platform: string;
  active: boolean;
  lastSeenAt: number;
};

export type ConnectState = {
  activeDeviceId: string;
  currentDeviceActive: boolean;
  devices: ConnectDevice[];
  song: ConnectSong | null;
  positionSeconds: number;
  durationSeconds: number;
  playing: boolean;
  volumeLevel: number;
  stateUpdatedAt: number;
  commandAction: string;
  commandValue: number;
  commandRevision: number;
  serverTime: number;
};

const DEVICE_KEY = 'nationmusics.connect.device-id.v1';
let cachedDeviceId = '';
let latestState: ConnectState | null = null;
let processedRevision = 0;
const listeners = new Set<(state: ConnectState | null) => void>();

function randomDeviceId() {
  return `${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function getConnectDeviceId() {
  if (cachedDeviceId) return cachedDeviceId;
  cachedDeviceId = (await AsyncStorage.getItem(DEVICE_KEY)) || randomDeviceId();
  await AsyncStorage.setItem(DEVICE_KEY, cachedDeviceId);
  return cachedDeviceId;
}

export function connectDeviceName() {
  if (Platform.OS === 'android') return 'Celular Android';
  if (Platform.OS === 'ios') return 'iPhone';
  return 'Dispositivo móvel';
}

export function getLatestConnectState() { return latestState; }
export function getProcessedConnectRevision() { return processedRevision; }
export function markConnectRevisionProcessed(revision: number) { processedRevision = Math.max(processedRevision, revision || 0); }

export function publishConnectState(state: ConnectState | null) {
  latestState = state;
  listeners.forEach((listener) => {
    try { listener(state); } catch {}
  });
}

export function subscribeConnectState(listener: (state: ConnectState | null) => void) {
  listeners.add(listener);
  listener(latestState);
  return () => { listeners.delete(listener); };
}

export async function sendConnectHeartbeat(playback: {
  song: ConnectSong | null;
  positionSeconds: number;
  durationSeconds: number;
  playing: boolean;
  volumeLevel: number;
}) {
  const deviceId = await getConnectDeviceId();
  const state = await apiRequest<ConnectState>('/connect/heartbeat', {
    method: 'POST', json: true,
    body: JSON.stringify({
      deviceId,
      deviceName: connectDeviceName(),
      platform: Platform.OS,
      ...playback,
      processedCommandRevision: processedRevision,
    }),
  });
  publishConnectState(state);
  return state;
}

export async function sendConnectControl(action: string, value?: number) {
  const deviceId = await getConnectDeviceId();
  const state = await apiRequest<ConnectState>('/connect/control', {
    method: 'POST', json: true,
    body: JSON.stringify({ deviceId, action, value }),
  });
  publishConnectState(state);
  return state;
}

export async function takeOverConnectPlayback() {
  return sendConnectControl('SYNC');
}
