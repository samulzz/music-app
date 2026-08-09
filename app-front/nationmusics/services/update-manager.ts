import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { UPDATE_MANIFEST_URL } from './config';

type UpdateTarget = {
  enabled?: boolean;
  mandatory?: boolean;
  version?: string;
  versionCode?: number;
  minimumVersion?: string;
  minimumVersionCode?: number;
  url?: string;
  releaseNotes?: string;
  message?: string;
};

type UpdateManifest = {
  android?: UpdateTarget;
  desktop?: UpdateTarget;
};

export type UpdateCheckResult = {
  status: 'current' | 'required' | 'offline' | 'unavailable';
  required: boolean;
  offline: boolean;
  currentVersion: string;
  currentVersionCode?: number;
  target?: UpdateTarget;
  message?: string;
};

const FALLBACK_APP_VERSION = '1.1.5';
const FALLBACK_ANDROID_VERSION_CODE = 7;
const UPDATE_TIMEOUT_MS = 8000;

const androidConfig = Constants.expoConfig?.android as { versionCode?: number } | undefined;
const extraConfig = Constants.expoConfig?.extra as { androidVersionCode?: number } | undefined;

export const CURRENT_APP_VERSION = Constants.expoConfig?.version || FALLBACK_APP_VERSION;
export const CURRENT_ANDROID_VERSION_CODE = Number(
  androidConfig?.versionCode ?? extraConfig?.androidVersionCode ?? FALLBACK_ANDROID_VERSION_CODE,
);

function versionParts(version: string) {
  return String(version || '0')
    .split(/[.-]/)
    .map((part) => Number.parseInt(part.replace(/\D.*/, ''), 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function compareVersions(left = '0', right = '0') {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length, 3);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

async function fetchUpdateManifest(): Promise<UpdateManifest> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPDATE_TIMEOUT_MS);
  try {
    const response = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Manifesto indisponivel (${response.status}).`);
    }
    return (await response.json()) as UpdateManifest;
  } finally {
    clearTimeout(timeout);
  }
}

function targetRequiresUpdate(target: UpdateTarget, currentVersion: string, currentVersionCode?: number) {
  const latestVersionIsNewer = target.version
    ? compareVersions(target.version, currentVersion) > 0
    : false;
  const minimumVersionIsNewer = target.minimumVersion
    ? compareVersions(target.minimumVersion, currentVersion) > 0
    : false;
  const latestCodeIsNewer = typeof target.versionCode === 'number' && typeof currentVersionCode === 'number'
    ? target.versionCode > currentVersionCode
    : false;
  const minimumCodeIsNewer = typeof target.minimumVersionCode === 'number' && typeof currentVersionCode === 'number'
    ? target.minimumVersionCode > currentVersionCode
    : false;

  return latestVersionIsNewer || minimumVersionIsNewer || latestCodeIsNewer || minimumCodeIsNewer;
}

export async function checkForRequiredUpdate(platform: 'android' | 'desktop' = Platform.OS === 'android' ? 'android' : 'android'): Promise<UpdateCheckResult> {
  const currentVersion = CURRENT_APP_VERSION;
  const currentVersionCode = platform === 'android' ? CURRENT_ANDROID_VERSION_CODE : undefined;

  try {
    const manifest = await fetchUpdateManifest();
    const target = manifest[platform];
    if (!target?.url || target.enabled === false) {
      return {
        status: 'unavailable',
        required: false,
        offline: false,
        currentVersion,
        currentVersionCode,
        message: 'Atualizador indisponivel.',
      };
    }

    const required = target.mandatory !== false && targetRequiresUpdate(target, currentVersion, currentVersionCode);
    return {
      status: required ? 'required' : 'current',
      required,
      offline: false,
      currentVersion,
      currentVersionCode,
      target,
      message: target.message,
    };
  } catch {
    return {
      status: 'offline',
      required: false,
      offline: true,
      currentVersion,
      currentVersionCode,
      message: 'Sem internet para verificar atualizacoes.',
    };
  }
}

export async function openUpdateDownload(result: UpdateCheckResult) {
  const url = result.target?.url;
  if (!url) return false;
  await Linking.openURL(url);
  return true;
}
