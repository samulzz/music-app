const DEFAULT_API_URL = 'https://pseudoprincely-plumular-nikolas.ngrok-free.dev/api';
const DEFAULT_API_KEY = 'REDACTED_API_KEY';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
export const API_KEY = process.env.EXPO_PUBLIC_API_KEY || DEFAULT_API_KEY;

export const APP_HEADERS = {
  'X-API-KEY': API_KEY,
  'ngrok-skip-browser-warning': 'true',
  Accept: 'application/json',
};

export function musicDownloadUrl(sourceId: string, title: string) {
  return `${API_BASE_URL}/musicas/baixar/${encodeURIComponent(sourceId)}?titulo=${encodeURIComponent(title)}`;
}
