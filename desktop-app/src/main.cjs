const { app, BrowserWindow, clipboard, ipcMain, protocol, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const DiscordRPC = require('discord-rpc');

let packagedConfig = {};
try {
  packagedConfig = require('./runtime-config.cjs');
} catch {
  // O arquivo e gerado localmente no build e nao faz parte do repositorio.
}

const API_BASE_URL = 'https://marlonbarbershop.com/nationmusics/api';
const API_KEY = process.env.NATIONMUSICS_API_KEY || packagedConfig.apiKey || '';
const DOWNLOAD_BASE_URL = 'https://marlonbarbershop.com/nationmusics/download';
const UPDATE_MANIFEST_URL = `${DOWNLOAD_BASE_URL}/update.json`;
const PREPARATION_TIMEOUT_MS = 8 * 60 * 1000;
const PREPARATION_POLL_MS = 2000;
const UPDATE_TIMEOUT_MS = 8000;
const UPDATE_DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const MIN_DESKTOP_INSTALLER_BYTES = 20 * 1024 * 1024;
const MIN_DESKTOP_AUDIO_BYTES = 512 * 1024;
const MAX_DESKTOP_AUDIO_CACHE_BYTES = 1024 * 1024 * 1024;
const DISCORD_ACTIVITY_UPDATE_INTERVAL_MS = 12_000;
const DISCORD_CLIENT_ID_ENV = 'NATIONMUSICS_DISCORD_CLIENT_ID';
const DISCORD_DEFAULT_CLIENT_ID = '1519319956796473544';

let mainWindow;
const activePreparations = new Map();
const activeAudioCacheDownloads = new Map();
let discordClient = null;
let discordClientId = '';
let discordConnecting = null;
let discordLastActivityKey = '';
let discordLastActivityAt = 0;
let discordStatus = {
  supported: true,
  enabled: true,
  configured: false,
  connected: false,
  state: 'needs_config',
  clientId: '',
  message: 'Configure o Client ID do Discord.',
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'nationmusic',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

function dataPath(name) {
  return path.join(app.getPath('userData'), name);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  await fsp.writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
  await fsp.rename(temporary, filePath);
}

function versionParts(version) {
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

function desktopTargetRequiresUpdate(target, currentVersion) {
  const latestVersionIsNewer = target.version
    ? compareVersions(target.version, currentVersion) > 0
    : false;
  const minimumVersionIsNewer = target.minimumVersion
    ? compareVersions(target.minimumVersion, currentVersion) > 0
    : false;
  return latestVersionIsNewer || minimumVersionIsNewer;
}

async function fetchUpdateManifest() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPDATE_TIMEOUT_MS);
  try {
    const response = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Manifesto indisponivel (${response.status}).`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function checkDesktopUpdate() {
  const currentVersion = app.getVersion();
  try {
    const manifest = await fetchUpdateManifest();
    const target = manifest?.desktop;
    if (!target?.url || target.enabled === false) {
      return {
        status: 'unavailable',
        required: false,
        offline: false,
        currentVersion,
        message: 'Atualizador indisponivel.',
      };
    }

    const required = target.mandatory !== false && desktopTargetRequiresUpdate(target, currentVersion);
    return {
      status: required ? 'required' : 'current',
      required,
      offline: false,
      currentVersion,
      target,
      message: target.message,
    };
  } catch {
    return {
      status: 'offline',
      required: false,
      offline: true,
      currentVersion,
      message: 'Sem internet para verificar atualizacoes.',
    };
  }
}

function allowedDownloadUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return '';
    if (url.hostname !== 'marlonbarbershop.com') return '';
    return url.href;
  } catch {
    return '';
  }
}

function installerFileNameFromUrl(rawUrl) {
  try {
    const name = path.basename(new URL(rawUrl).pathname);
    return name.endsWith('.exe') ? name : 'NationMusics-Setup.exe';
  } catch {
    return 'NationMusics-Setup.exe';
  }
}

async function downloadDesktopInstaller(rawUrl) {
  const url = allowedDownloadUrl(rawUrl) || `${DOWNLOAD_BASE_URL}/NationMusics-Setup.exe`;
  const updatesDirectory = dataPath('updates');
  await fsp.mkdir(updatesDirectory, { recursive: true });

  const fileName = installerFileNameFromUrl(url);
  const destination = path.join(updatesDirectory, `${Date.now()}-${fileName}`);
  const temporary = `${destination}.part`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPDATE_DOWNLOAD_TIMEOUT_MS);

  try {
    await fsp.rm(temporary, { force: true });
    const response = await fetch(url, {
      headers: { Accept: 'application/octet-stream' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Download da atualizacao falhou (${response.status}).`);
    }

    if (response.body) {
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary));
    } else {
      await fsp.writeFile(temporary, Buffer.from(await response.arrayBuffer()));
    }

    const stat = await fsp.stat(temporary);
    if (!stat.isFile() || stat.size < MIN_DESKTOP_INSTALLER_BYTES) {
      throw new Error('Instalador baixado incompleto.');
    }

    await fsp.rename(temporary, destination);
    return destination;
  } catch (error) {
    await fsp.rm(temporary, { force: true }).catch(() => {});
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function launchDownloadedInstaller(installerPath) {
  const child = spawn(installerPath, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
  setTimeout(() => app.quit(), 800);
}

function trimDiscordClientId(value) {
  const clientId = String(value || '').trim();
  return /^\d{15,24}$/.test(clientId) ? clientId : '';
}

function truncateDiscordText(value, fallback) {
  const text = String(value || fallback || '').trim();
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function isDiscordImageUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' && url.href.length <= 512;
  } catch {
    return false;
  }
}

function discordTimestamps(activity) {
  if (!activity.startTimestamp && !activity.endTimestamp) return undefined;
  return {
    start: activity.startTimestamp,
    end: activity.endTimestamp,
  };
}

function discordAssets(activity) {
  if (
    !activity.largeImageKey
    && !activity.largeImageText
    && !activity.smallImageKey
    && !activity.smallImageText
  ) {
    return undefined;
  }

  return {
    large_image: activity.largeImageKey,
    large_text: activity.largeImageText,
    small_image: activity.smallImageKey,
    small_text: activity.smallImageText,
  };
}

async function setDiscordListeningActivity(activity) {
  if (!discordClient?.request) {
    await discordClient.setActivity(activity);
    return;
  }

  await discordClient.request('SET_ACTIVITY', {
    pid: process.pid,
    activity: {
      type: 2,
      state: activity.state,
      details: activity.details,
      timestamps: discordTimestamps(activity),
      assets: discordAssets(activity),
      buttons: activity.buttons,
      instance: Boolean(activity.instance),
    },
  });
}

async function getSettings() {
  return readJson(dataPath('settings.json'), {});
}

async function saveSettings(settings) {
  await writeJson(dataPath('settings.json'), settings || {});
}

async function getDiscordSettings() {
  const settings = await getSettings();
  const enabled = settings.discord?.enabled !== false;
  const clientIdFromEnv = trimDiscordClientId(process.env[DISCORD_CLIENT_ID_ENV]);
  const clientIdFromSettings = trimDiscordClientId(settings.discord?.clientId);
  const clientId = enabled
    ? clientIdFromEnv || clientIdFromSettings || DISCORD_DEFAULT_CLIENT_ID
    : clientIdFromEnv || clientIdFromSettings;
  return {
    enabled,
    clientId,
    clientIdLockedByEnv: Boolean(clientIdFromEnv),
  };
}

async function saveDiscordSettings(nextDiscord) {
  const settings = await getSettings();
  settings.discord = {
    ...(settings.discord || {}),
    enabled: nextDiscord.enabled !== false,
    clientId: trimDiscordClientId(nextDiscord.clientId),
  };
  await saveSettings(settings);
  return getDiscordSettings();
}

function toPublicDiscordStatus(overrides = {}) {
  return {
    ...discordStatus,
    ...overrides,
    clientId: overrides.clientId ?? discordStatus.clientId ?? '',
    configured: overrides.configured ?? Boolean(overrides.clientId ?? discordStatus.clientId),
  };
}

function setDiscordStatus(overrides) {
  discordStatus = toPublicDiscordStatus(overrides);
  return discordStatus;
}

function destroyDiscordClient() {
  if (discordClient) {
    try {
      discordClient.clearActivity?.();
    } catch {}
    try {
      discordClient.destroy?.();
    } catch {}
  }
  discordClient = null;
  discordClientId = '';
  discordConnecting = null;
  discordLastActivityKey = '';
  discordLastActivityAt = 0;
}

async function ensureDiscordConnected() {
  const settings = await getDiscordSettings();
  if (!settings.enabled) {
    destroyDiscordClient();
    return setDiscordStatus({
      enabled: false,
      configured: Boolean(settings.clientId),
      connected: false,
      state: 'disabled',
      clientId: settings.clientId,
      message: 'Discord desativado.',
    });
  }

  if (!settings.clientId) {
    destroyDiscordClient();
    return setDiscordStatus({
      enabled: true,
      configured: false,
      connected: false,
      state: 'needs_config',
      clientId: '',
      message: 'Configure o Client ID do Discord.',
    });
  }

  if (discordClient && discordClientId === settings.clientId && discordStatus.connected) {
    return setDiscordStatus({
      enabled: true,
      configured: true,
      connected: true,
      state: 'connected',
      clientId: settings.clientId,
      message: 'Discord conectado.',
    });
  }

  if (discordConnecting) {
    await discordConnecting.catch(() => {});
    return discordStatus;
  }

  destroyDiscordClient();
  discordClientId = settings.clientId;
  setDiscordStatus({
    enabled: true,
    configured: true,
    connected: false,
    state: 'connecting',
    clientId: settings.clientId,
    message: 'Conectando ao Discord...',
  });

  try {
    DiscordRPC.register(settings.clientId);
  } catch {}

  const client = new DiscordRPC.Client({ transport: 'ipc' });
  discordClient = client;

  client.on('ready', () => {
    setDiscordStatus({
      enabled: true,
      configured: true,
      connected: true,
      state: 'connected',
      clientId: settings.clientId,
      message: 'Discord conectado.',
    });
  });

  client.on('disconnected', () => {
    setDiscordStatus({
      enabled: true,
      configured: true,
      connected: false,
      state: 'disconnected',
      clientId: settings.clientId,
      message: 'Discord desconectado.',
    });
  });

  client.on('error', (error) => {
    setDiscordStatus({
      enabled: true,
      configured: true,
      connected: false,
      state: 'error',
      clientId: settings.clientId,
      message: error?.message || 'Erro ao conectar ao Discord.',
    });
  });

  discordConnecting = client.login({ clientId: settings.clientId })
    .then(() => setDiscordStatus({
      enabled: true,
      configured: true,
      connected: true,
      state: 'connected',
      clientId: settings.clientId,
      message: 'Discord conectado.',
    }))
    .catch((error) => {
      destroyDiscordClient();
      return setDiscordStatus({
        enabled: true,
        configured: true,
        connected: false,
        state: 'error',
        clientId: settings.clientId,
        message: error?.message || 'Abra o Discord e confirme o Client ID.',
      });
    })
    .finally(() => {
      discordConnecting = null;
    });

  await discordConnecting.catch(() => {});
  return discordStatus;
}

function activityPayloadKey(activity) {
  return JSON.stringify({
    type: activity.type,
    details: activity.details,
    state: activity.state,
    startTimestamp: activity.startTimestamp,
    endTimestamp: activity.endTimestamp,
    largeImageKey: activity.largeImageKey,
    largeImageText: activity.largeImageText,
    smallImageKey: activity.smallImageKey,
    smallImageText: activity.smallImageText,
  });
}

async function updateDiscordActivity(payload = {}) {
  const song = normalizeSong(payload.song || {});
  const playing = payload.playing !== false;
  const positionSeconds = Math.max(0, Number(payload.positionSeconds) || 0);
  const durationSeconds = Math.max(0, Number(payload.durationSeconds) || 0);

  if (!playing || !song.title) {
    return clearDiscordActivity();
  }

  const status = await ensureDiscordConnected();
  if (!status.connected || !discordClient) return status;

  const now = Date.now();
  const startTimestamp = Math.floor((now - positionSeconds * 1000) / 1000);
  const endTimestamp = durationSeconds > positionSeconds + 1
    ? Math.floor((now + (durationSeconds - positionSeconds) * 1000) / 1000)
    : undefined;
  const artworkUrl = isDiscordImageUrl(song.artworkUrl) ? song.artworkUrl.trim() : '';
  const activity = {
    type: 2,
    details: truncateDiscordText(song.title, 'Ouvindo música'),
    state: truncateDiscordText(song.artist, 'NationMusics'),
    startTimestamp,
    largeImageKey: artworkUrl || 'nationmusics',
    largeImageText: truncateDiscordText(song.title, 'NationMusics'),
    instance: false,
  };
  if (endTimestamp) activity.endTimestamp = endTimestamp;

  const nextKey = activityPayloadKey(activity);
  if (
    nextKey === discordLastActivityKey
    && now - discordLastActivityAt < DISCORD_ACTIVITY_UPDATE_INTERVAL_MS
  ) {
    return status;
  }

  try {
    await setDiscordListeningActivity(activity);
    discordLastActivityKey = nextKey;
    discordLastActivityAt = now;
    return setDiscordStatus({
      ...status,
      connected: true,
      state: 'connected',
      message: 'Status atualizado no Discord.',
    });
  } catch (error) {
    try {
      const fallbackActivity = {
        ...activity,
        largeImageKey: 'nationmusics',
        largeImageText: 'NationMusics',
      };
      await setDiscordListeningActivity(fallbackActivity);
      discordLastActivityKey = activityPayloadKey(fallbackActivity);
      discordLastActivityAt = now;
      return setDiscordStatus({
        ...status,
        connected: true,
        state: 'connected',
        message: 'Status atualizado no Discord com imagem padrão.',
      });
    } catch {}

    try {
      const fallbackActivity = { ...activity };
      delete fallbackActivity.largeImageKey;
      delete fallbackActivity.largeImageText;
      delete fallbackActivity.smallImageKey;
      delete fallbackActivity.smallImageText;
      await setDiscordListeningActivity(fallbackActivity);
      discordLastActivityKey = activityPayloadKey(fallbackActivity);
      discordLastActivityAt = now;
      return setDiscordStatus({
        ...status,
        connected: true,
        state: 'connected',
        message: 'Status atualizado no Discord sem imagem.',
      });
    } catch {}

    return setDiscordStatus({
      ...status,
      connected: false,
      state: 'error',
      message: error?.message || 'Não foi possível atualizar o Discord.',
    });
  }
}

async function clearDiscordActivity() {
  const settings = await getDiscordSettings();
  if (!settings.enabled || !settings.clientId || !discordClient) {
    return setDiscordStatus({
      enabled: settings.enabled,
      configured: Boolean(settings.clientId),
      connected: Boolean(discordClient && discordStatus.connected),
      state: settings.clientId ? discordStatus.state : 'needs_config',
      clientId: settings.clientId,
      message: settings.clientId ? discordStatus.message : 'Configure o Client ID do Discord.',
    });
  }

  try {
    await discordClient.clearActivity();
    discordLastActivityKey = '';
    discordLastActivityAt = 0;
  } catch {}
  return discordStatus;
}

async function getSession() {
  return readJson(dataPath('session.json'), null);
}

async function saveSession(session) {
  if (!session) {
    await fsp.rm(dataPath('session.json'), { force: true });
    return;
  }
  await writeJson(dataPath('session.json'), session);
}

function normalizeSong(song, saved = false) {
  const sourceId = String(song.sourceId ?? song.id ?? '');
  return {
    id: String(song.id ?? (sourceId || randomUUID())),
    sourceId,
    title: String(song.title ?? song.titulo ?? 'Música'),
    artist: String(song.artist ?? song.artista ?? 'Artista desconhecido'),
    artworkUrl: song.artworkUrl ?? song.coverUrl ?? song.capa ?? '',
    serverId: Number.isFinite(Number(song.id)) ? Number(song.id) : undefined,
    saved,
  };
}

async function apiRequest(endpoint, options = {}) {
  const session = await getSession();
  const headers = {
    Accept: 'application/json',
    'X-API-KEY': API_KEY,
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.auth === false || !session?.token
      ? {}
      : { Authorization: `Bearer ${session.token}` }),
  };

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error('Não foi possível conectar ao servidor.');
  }

  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}

  if (!response.ok) {
    const message = body && typeof body === 'object' && body.message
      ? body.message
      : String(body || '').trim();

    if ((response.status === 401 || response.status === 403) && options.auth !== false) {
      await saveSession(null);
      throw new Error('Sessão expirada. Entre novamente.');
    }

    throw new Error(message || `Erro do servidor (${response.status}).`);
  }
  return body;
}

async function waitUntilPrepared(song) {
  const sourceId = song.sourceId || song.id;
  if (activePreparations.has(sourceId)) return activePreparations.get(sourceId);

  const operation = (async () => {
    const metadata = `?titulo=${encodeURIComponent(song.title || 'Música')}&artista=${encodeURIComponent(song.artist || '')}`;
    await apiRequest(`/musicas/preparar/${encodeURIComponent(sourceId)}${metadata}`, { method: 'POST' });
    const startedAt = Date.now();
    while (Date.now() - startedAt < PREPARATION_TIMEOUT_MS) {
      await new Promise((resolve) => setTimeout(resolve, PREPARATION_POLL_MS));
      const result = await apiRequest(`/musicas/preparar/${encodeURIComponent(sourceId)}/status`);
      if (result.status === 'ready') return;
      if (result.status === 'error') {
        throw new Error(result.message || 'Não foi possível preparar esta música.');
      }
    }
    throw new Error('A preparação demorou demais. Tente novamente mais tarde.');
  })().finally(() => activePreparations.delete(sourceId));

  activePreparations.set(sourceId, operation);
  return operation;
}

function audioCacheDirectory() {
  return dataPath('audio-cache');
}

function safeAudioCacheName(value) {
  return String(value || 'track')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'track';
}

function cachedAudioFilePath(sourceId) {
  return path.join(audioCacheDirectory(), `${safeAudioCacheName(sourceId)}.mp3`);
}

async function hasUsableCachedAudio(filePath) {
  try {
    const stat = await fsp.stat(filePath);
    return stat.isFile() && stat.size >= MIN_DESKTOP_AUDIO_BYTES;
  } catch {
    return false;
  }
}

async function trimDesktopAudioCache() {
  let entries = [];
  try {
    entries = await fsp.readdir(audioCacheDirectory(), { withFileTypes: true });
  } catch {
    return;
  }

  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.mp3')) continue;
    const filePath = path.join(audioCacheDirectory(), entry.name);
    try {
      const stat = await fsp.stat(filePath);
      files.push({ filePath, size: stat.size, mtimeMs: stat.mtimeMs });
    } catch {}
  }

  let total = files.reduce((sum, file) => sum + file.size, 0);
  files.sort((left, right) => left.mtimeMs - right.mtimeMs);
  for (const file of files) {
    if (total <= MAX_DESKTOP_AUDIO_CACHE_BYTES) break;
    try {
      await fsp.unlink(file.filePath);
      total -= file.size;
    } catch {}
  }
}

async function ensureDesktopAudioCached(song) {
  const sourceId = song.sourceId || song.id;
  if (!sourceId) return '';
  const filePath = cachedAudioFilePath(sourceId);
  if (await hasUsableCachedAudio(filePath)) return filePath;
  if (activeAudioCacheDownloads.has(sourceId)) return activeAudioCacheDownloads.get(sourceId);

  const operation = (async () => {
    await fsp.mkdir(audioCacheDirectory(), { recursive: true });
    const temporary = `${filePath}.${process.pid}.part`;
    const session = await getSession();
    if (!session?.token) throw new Error('Sessao expirada.');

    try {
      await fsp.rm(temporary, { force: true });
      const response = await fetch(
        `${API_BASE_URL}/musicas/baixar/${encodeURIComponent(sourceId)}?titulo=${encodeURIComponent(song.title || 'Musica')}&artista=${encodeURIComponent(song.artist || '')}`,
        {
          headers: {
            Accept: 'audio/mpeg',
            'X-API-KEY': API_KEY,
            Authorization: `Bearer ${session.token}`,
          },
        }
      );
      if (!response.ok) {
        const details = await response.text().catch(() => '');
        throw new Error(details.trim() || `Download falhou (${response.status}).`);
      }

      if (response.body) {
        await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary));
      } else {
        await fsp.writeFile(temporary, Buffer.from(await response.arrayBuffer()));
      }

      const stat = await fsp.stat(temporary);
      if (!stat.isFile() || stat.size < MIN_DESKTOP_AUDIO_BYTES) {
        throw new Error('Arquivo de audio incompleto.');
      }

      await fsp.rm(filePath, { force: true });
      await fsp.rename(temporary, filePath);
      void trimDesktopAudioCache();
      return filePath;
    } catch (error) {
      await fsp.rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
  })().finally(() => activeAudioCacheDownloads.delete(sourceId));

  activeAudioCacheDownloads.set(sourceId, operation);
  return operation;
}

async function cachedAudioResponse(filePath, request) {
  const stat = await fsp.stat(filePath);
  const size = stat.size;
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=31536000',
    'Content-Type': 'audio/mpeg',
  });

  let status = 200;
  let start = 0;
  let end = size - 1;
  const range = request.headers.get('range');
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (match) {
    status = 206;
    if (match[1]) {
      start = Number.parseInt(match[1], 10);
      end = match[2] ? Number.parseInt(match[2], 10) : end;
    } else if (match[2]) {
      const suffixLength = Number.parseInt(match[2], 10);
      start = Math.max(size - suffixLength, 0);
    }
    end = Math.min(end, size - 1);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
      return new Response(null, {
        status: 416,
        headers: {
          'Content-Range': `bytes */${size}`,
        },
      });
    }
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  }

  headers.set('Content-Length', String(end - start + 1));
  return new Response(Readable.toWeb(fs.createReadStream(filePath, { start, end })), {
    status,
    headers,
  });
}

function streamUrl(song) {
  const sourceId = song.sourceId || song.id;
  return `nationmusic://stream/${encodeURIComponent(sourceId)}?title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist || '')}`;
}

async function handleAudioStream(request) {
  try {
    const requestedUrl = new URL(request.url);
    const sourceId = decodeURIComponent(requestedUrl.pathname.replace(/^\/+/, ''));
    const title = requestedUrl.searchParams.get('title') || 'Música';
    const artist = requestedUrl.searchParams.get('artist') || '';
    const session = await getSession();
    if (!session?.token) {
      return new Response('Sessão expirada.', { status: 401 });
    }

    const cachedPath = cachedAudioFilePath(sourceId);
    if (await hasUsableCachedAudio(cachedPath)) {
      return cachedAudioResponse(cachedPath, request);
    }

    const headers = {
      Accept: 'audio/mpeg',
      'X-API-KEY': API_KEY,
      Authorization: `Bearer ${session.token}`,
    };
    const range = request.headers.get('range');
    if (range) headers.Range = range;

    const response = await fetch(
      `${API_BASE_URL}/musicas/baixar/${encodeURIComponent(sourceId)}?titulo=${encodeURIComponent(title)}&artista=${encodeURIComponent(artist)}`,
      { headers }
    );
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Content-Type', 'audio/mpeg');
    responseHeaders.set('Cache-Control', 'no-store');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Falha no streaming.', {
      status: 500,
    });
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#101010',
    icon: path.join(__dirname, 'assets/icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  await mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

ipcMain.handle('session:get', () => getSession());
ipcMain.handle('auth:login', async (_event, credentials) => {
  const response = await apiRequest('/auth/login', {
    method: 'POST',
    auth: false,
    body: credentials,
  });
  const session = { token: response.token, username: response.username };
  await saveSession(session);
  return session;
});
ipcMain.handle('auth:register', async (_event, credentials) => {
  const response = await apiRequest('/auth/register', {
    method: 'POST',
    auth: false,
    body: credentials,
  });
  const session = { token: response.token, username: response.username };
  await saveSession(session);
  return session;
});
ipcMain.handle('auth:logout', async () => {
  await saveSession(null);
  return true;
});
ipcMain.handle('updates:check', () => checkDesktopUpdate());
ipcMain.handle('updates:open-download', async (_event, rawUrl) => {
  const installerPath = await downloadDesktopInstaller(rawUrl);
  await launchDownloadedInstaller(installerPath);
  return true;
});
ipcMain.handle('music:search', async (_event, query) => {
  const songs = await apiRequest(`/songs/search?q=${encodeURIComponent(query)}`);
  return songs.map((song) => normalizeSong(song, false));
});
ipcMain.handle('music:genre', async (_event, genre) => {
  const songs = await apiRequest(`/songs/genre?genre=${encodeURIComponent(String(genre || '').trim())}`);
  return songs.map((song) => normalizeSong(song, false));
});
ipcMain.handle('music:prepare-stream', async (_event, rawSong) => {
  const song = normalizeSong(rawSong);
  if (!song.sourceId) throw new Error('Esta música não possui uma origem válida.');
  await waitUntilPrepared(song);
  void ensureDesktopAudioCached(song).catch((error) => {
    console.warn('Cache local de audio indisponivel:', error instanceof Error ? error.message : error);
  });
  return streamUrl(song);
});
ipcMain.handle('music:download', async (_event, rawSong) => {
  const song = normalizeSong(rawSong);
  if (!song.sourceId) throw new Error('Esta música não possui uma origem válida.');
  await waitUntilPrepared(song);
  await ensureDesktopAudioCached(song);
  return true;
});
ipcMain.handle('music:is-downloaded', async (_event, rawSong) => {
  const song = normalizeSong(rawSong);
  if (!song.sourceId) return false;
  return hasUsableCachedAudio(cachedAudioFilePath(song.sourceId));
});
ipcMain.handle('music:cache-stats', async () => {
  let entries = [];
  try { entries = await fsp.readdir(audioCacheDirectory(), { withFileTypes: true }); } catch { return { count: 0, bytes: 0 }; }
  let count = 0;
  let bytes = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.mp3')) continue;
    try { const stat = await fsp.stat(path.join(audioCacheDirectory(), entry.name)); count += 1; bytes += stat.size; } catch {}
  }
  return { count, bytes };
});
ipcMain.handle('music:clear-cache', async () => {
  let entries = [];
  try { entries = await fsp.readdir(audioCacheDirectory(), { withFileTypes: true }); } catch { return true; }
  await Promise.all(entries.filter((entry) => entry.isFile()).map((entry) => fsp.rm(path.join(audioCacheDirectory(), entry.name), { force: true })));
  return true;
});
ipcMain.handle('spotify:preview', async (_event, url) => {
  return apiRequest('/spotify/import/preview', {
    method: 'POST',
    body: { url },
  });
});
ipcMain.handle('library:list', async () => {
  const songs = await apiRequest('/songs/my-library');
  return songs.map((song) => normalizeSong(song, true));
});
ipcMain.handle('library:save', async (_event, rawSong) => {
  const song = normalizeSong(rawSong);
  if (!song.sourceId) throw new Error('Esta música não possui uma origem válida.');
  await apiRequest('/songs/save', {
    method: 'POST',
    body: {
      title: song.title,
      artist: song.artist,
      uri: `${API_BASE_URL}/musicas/baixar/${encodeURIComponent(song.sourceId)}`,
      coverUrl: song.artworkUrl,
      sourceId: song.sourceId,
    },
  });
  return { ...song, saved: true };
});
ipcMain.handle('library:remove', async (_event, serverId) => {
  if (!serverId) throw new Error('Não foi possível identificar esta música.');
  await apiRequest(`/songs/remove/${encodeURIComponent(serverId)}`, { method: 'DELETE' });
  return true;
});
ipcMain.handle('playlists:list', async () => {
  const [global, daily] = await Promise.all([
    apiRequest('/playlists/global'),
    apiRequest('/recommendations/daily').catch(() => null),
  ]);
  return [
    ...(daily ? [{
      id: 'daily',
      name: daily.name,
      description: daily.description,
      daily: true,
    }] : []),
    {
      id: 'most-downloaded',
      name: 'Mais ouvidas',
      description: 'As músicas mais salvas pela comunidade.',
    },
    ...global,
  ];
});
ipcMain.handle('playlists:songs', async (_event, id) => {
  const endpoint = id === 'daily'
    ? '/recommendations/daily'
    : id === 'most-downloaded'
    ? '/playlists/most-downloaded/songs'
    : `/playlists/${encodeURIComponent(id)}/songs`;
  const response = await apiRequest(endpoint);
  const songs = id === 'daily' ? response.songs : response;
  return songs.map((song) => normalizeSong(song, false));
});
ipcMain.handle('recommendations:daily', async () => {
  const mix = await apiRequest('/recommendations/daily');
  return { ...mix, songs: (mix.songs || []).map((song) => normalizeSong(song, false)) };
});
ipcMain.handle('recommendations:listen', async (_event, payload) => {
  await apiRequest('/recommendations/listen', {
    method: 'POST',
    body: {
      songId: Number(payload?.songId) || null,
      sourceId: String(payload?.sourceId || '').trim() || null,
      listenedSeconds: Math.max(0, Math.round(Number(payload?.listenedSeconds) || 0)),
      completed: Boolean(payload?.completed),
    },
  });
  return true;
});
ipcMain.handle('recommendations:feedback', async (_event, payload) => {
  await apiRequest('/recommendations/feedback', {
    method: 'PUT',
    body: {
      songId: Number(payload?.songId) || null,
      sourceId: String(payload?.sourceId || '').trim() || null,
      action: String(payload?.action || ''),
    },
  });
  return true;
});
ipcMain.handle('personal-playlists:list', async () => {
  return apiRequest('/playlists/personal');
});
ipcMain.handle('personal-playlists:songs', async (_event, id) => {
  const songs = await apiRequest(`/playlists/personal/${encodeURIComponent(id)}/songs`);
  return songs.map((song) => normalizeSong(song, false));
});
ipcMain.handle('personal-playlists:create', async (_event, playlist) => {
  return apiRequest('/playlists/personal', {
    method: 'POST',
    body: {
      name: playlist?.name,
      description: playlist?.description || null,
      iconUrl: playlist?.iconUrl || null,
      globalPlaylist: false,
    },
  });
});
ipcMain.handle('personal-playlists:update', async (_event, playlistId, playlist) => {
  return apiRequest(`/playlists/personal/${encodeURIComponent(playlistId)}`, {
    method: 'PUT',
    body: {
      name: playlist?.name,
      description: playlist?.description || null,
      iconUrl: playlist?.iconUrl || null,
      globalPlaylist: false,
    },
  });
});
ipcMain.handle('personal-playlists:delete', async (_event, playlistId) => {
  await apiRequest(`/playlists/personal/${encodeURIComponent(playlistId)}`, { method: 'DELETE' });
  return true;
});
ipcMain.handle('personal-playlists:add-song', async (_event, playlistId, songId) => {
  return apiRequest(`/playlists/personal/${encodeURIComponent(playlistId)}/songs/${encodeURIComponent(songId)}`, {
    method: 'POST',
  });
});
ipcMain.handle('personal-playlists:remove-song', async (_event, playlistId, songId) => {
  return apiRequest(`/playlists/personal/${encodeURIComponent(playlistId)}/songs/${encodeURIComponent(songId)}`, {
    method: 'DELETE',
  });
});
ipcMain.handle('friends:list', async () => {
  return apiRequest('/friends');
});
ipcMain.handle('friends:search', async (_event, query) => {
  return apiRequest(`/friends/search?q=${encodeURIComponent(String(query || '').trim())}`);
});
ipcMain.handle('friends:requests', async () => {
  return apiRequest('/friends/requests');
});
ipcMain.handle('friends:send-request', async (_event, username) => {
  return apiRequest('/friends/request', {
    method: 'POST',
    body: { username: String(username || '').trim() },
  });
});
ipcMain.handle('friends:accept-request', async (_event, requestId) => {
  return apiRequest(`/friends/requests/${encodeURIComponent(requestId)}/accept`, {
    method: 'POST',
  });
});
ipcMain.handle('friends:decline-request', async (_event, requestId) => {
  return apiRequest(`/friends/requests/${encodeURIComponent(requestId)}`, {
    method: 'DELETE',
  });
});
ipcMain.handle('friends:remove', async (_event, username) => {
  return apiRequest(`/friends/${encodeURIComponent(String(username || '').trim())}`, {
    method: 'DELETE',
  });
});
ipcMain.handle('friends:update-presence', async (_event, payload) => {
  return apiRequest('/friends/presence', {
    method: 'POST',
    body: payload || {},
  });
});
ipcMain.handle('friends:clear-presence', async () => {
  return apiRequest('/friends/presence', {
    method: 'DELETE',
  });
});
ipcMain.handle('connect:heartbeat', async (_event, payload) => {
  return apiRequest('/connect/heartbeat', { method: 'POST', body: payload || {} });
});
ipcMain.handle('connect:control', async (_event, payload) => {
  return apiRequest('/connect/control', { method: 'POST', body: payload || {} });
});
ipcMain.handle('jam:create', async (_event, payload) => {
  return apiRequest('/jams', {
    method: 'POST',
    body: payload || {},
  });
});
ipcMain.handle('jam:join', async (_event, code) => {
  return apiRequest(`/jams/${encodeURIComponent(String(code || '').trim())}/join`, {
    method: 'POST',
  });
});
ipcMain.handle('jam:get', async (_event, code) => {
  return apiRequest(`/jams/${encodeURIComponent(String(code || '').trim())}`);
});
ipcMain.handle('jam:update-state', async (_event, code, payload) => {
  return apiRequest(`/jams/${encodeURIComponent(String(code || '').trim())}/state`, {
    method: 'PUT',
    body: payload || {},
  });
});
ipcMain.handle('jam:leave', async (_event, code) => {
  return apiRequest(`/jams/${encodeURIComponent(String(code || '').trim())}/leave`, {
    method: 'POST',
  });
});
ipcMain.handle('clipboard:write-text', async (_event, text) => {
  clipboard.writeText(String(text || ''));
  return true;
});
ipcMain.handle('discord:get-status', async () => {
  await ensureDiscordConnected();
  return discordStatus;
});
ipcMain.handle('discord:configure', async (_event, nextDiscord) => {
  const currentSettings = await getDiscordSettings();
  if (currentSettings.clientIdLockedByEnv) {
    return setDiscordStatus({
      enabled: true,
      configured: true,
      connected: discordStatus.connected,
      state: discordStatus.connected ? 'connected' : 'configured',
      clientId: currentSettings.clientId,
      message: `Client ID definido por ${DISCORD_CLIENT_ID_ENV}.`,
    });
  }

  const settings = await saveDiscordSettings({
    enabled: nextDiscord?.enabled !== false,
    clientId: nextDiscord?.clientId,
  });
  destroyDiscordClient();
  return settings.enabled && settings.clientId
    ? ensureDiscordConnected()
    : setDiscordStatus({
      enabled: settings.enabled,
      configured: Boolean(settings.clientId),
      connected: false,
      state: settings.enabled ? 'needs_config' : 'disabled',
      clientId: settings.clientId,
      message: settings.enabled ? 'Configure o Client ID do Discord.' : 'Discord desativado.',
    });
});
ipcMain.handle('discord:update-activity', async (_event, payload) => updateDiscordActivity(payload));
ipcMain.handle('discord:clear-activity', async () => clearDiscordActivity());

app.whenReady().then(async () => {
  protocol.handle('nationmusic', handleAudioStream);
  await createWindow();
});
app.on('before-quit', () => {
  destroyDiscordClient();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
