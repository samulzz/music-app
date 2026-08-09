const DEFAULT_API_URL = 'https://marlonbarbershop.com/nationmusics/api';
const DEFAULT_API_KEY = 'REDACTED_API_KEY';
const DEFAULT_DOWNLOAD_URL = 'https://marlonbarbershop.com/nationmusics/download';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
export const API_KEY = process.env.EXPO_PUBLIC_API_KEY || DEFAULT_API_KEY;
export const DOWNLOAD_BASE_URL = (process.env.EXPO_PUBLIC_DOWNLOAD_URL || DEFAULT_DOWNLOAD_URL).replace(/\/$/, '');
export const UPDATE_MANIFEST_URL = `${DOWNLOAD_BASE_URL}/update.json`;

export const APP_HEADERS = {
  'X-API-KEY': API_KEY,
  'ngrok-skip-browser-warning': 'true',
  Accept: 'application/json',
};

export function musicDownloadUrl(sourceId: string, title: string, artist = '') {
  return `${API_BASE_URL}/musicas/baixar/${encodeURIComponent(sourceId)}?titulo=${encodeURIComponent(title)}&artista=${encodeURIComponent(artist)}`;
}

export function musicPreparePath(sourceId: string, title: string, artist = '') {
  return `/musicas/preparar/${encodeURIComponent(sourceId)}?titulo=${encodeURIComponent(title)}&artista=${encodeURIComponent(artist)}`;
}
