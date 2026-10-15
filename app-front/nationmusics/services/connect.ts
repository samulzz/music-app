import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { apiRequest } from './api';
import { getSession } from './auth';

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
  contextType?: string;
  contextId?: string;
  contextName?: string;
};

export type PlaybackContext = { type: string; id: string; name: string };

const DEVICE_KEY = 'nationmusics.connect.device-id.v1';
let cachedDeviceId = '';
let deviceIdPromise: Promise<string> | null = null;
let revisionAccount = '';
let revisionLoadAccount = '';
let revisionLoading: Promise<void> | null = null;
let controlEpoch = 0;
let latestState: ConnectState | null = null;
let processedRevision = 0;
const listeners = new Set<(state: ConnectState | null) => void>();

function randomDeviceId() {
  return `${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function getConnectDeviceId() {
  if (cachedDeviceId) return cachedDeviceId;
  if (!deviceIdPromise) deviceIdPromise = (async () => {
    cachedDeviceId = (await AsyncStorage.getItem(DEVICE_KEY)) || randomDeviceId();
    await AsyncStorage.setItem(DEVICE_KEY, cachedDeviceId);
    return cachedDeviceId;
  })().catch(error => { deviceIdPromise = null; throw error; });
  return deviceIdPromise;
}

export function connectDeviceName() {
  if (Platform.OS === 'android') return 'Celular Android';
  if (Platform.OS === 'ios') return 'iPhone';
  return 'Dispositivo móvel';
}

export function getLatestConnectState() { return latestState; }
export function getConnectControlEpoch() { return controlEpoch; }
export function getProcessedConnectRevision() { return processedRevision; }
export function markConnectRevisionProcessed(revision: number) {
  processedRevision = Math.max(processedRevision, revision || 0);
  if (revisionAccount) void AsyncStorage.setItem(`nationmusics.connect.revision.${revisionAccount}`, String(processedRevision)).catch(() => {});
}

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

async function loadProcessedRevision() {
  const account = (await getSession())?.username || '';
  if (!revisionLoading || revisionLoadAccount !== account) {
    revisionLoadAccount = account;
    revisionLoading = (async () => {
      const revision = Number(await AsyncStorage.getItem(`nationmusics.connect.revision.${account}`)) || 0;
      revisionAccount = account;
      processedRevision = revision;
    })();
  }
  await revisionLoading;
}

export async function sendConnectHeartbeat(playback: {
  song: ConnectSong | null;
  positionSeconds: number;
  durationSeconds: number;
  playing: boolean;
  volumeLevel: number;
  context?: PlaybackContext | null;
}) {
  const deviceId = await getConnectDeviceId();
  await loadProcessedRevision();
  const epoch = controlEpoch;
  const state = await apiRequest<ConnectState>('/connect/heartbeat', {
    method: 'POST', json: true, timeoutMs: 4000,
    body: JSON.stringify({
      deviceId,
      deviceName: connectDeviceName(),
      platform: Platform.OS,
      ...playback,
      contextType: playback.context?.type || '',
      contextId: playback.context?.id || '',
      contextName: playback.context?.name || '',
      processedCommandRevision: processedRevision,
    }),
  });
  if (epoch !== controlEpoch) return null;
  publishConnectState(state);
  return state;
}

export async function sendConnectControl(action: string, value?: number) {
  controlEpoch += 1;
  const epoch = controlEpoch;
  const deviceId = await getConnectDeviceId();
  await loadProcessedRevision();
  const state = await apiRequest<ConnectState>('/connect/control', {
    method: 'POST', json: true, timeoutMs: 2500,
    body: JSON.stringify({ deviceId, action, value }),
  });
  if (epoch !== controlEpoch) throw new Error('Comando substituído por uma ação mais recente.');
  publishConnectState(state);
  return state;
}

export async function takeOverConnectPlayback() {
  return sendConnectControl('SYNC');
}
