const { app, BrowserWindow, ipcMain, protocol, shell } = require('electron');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const API_BASE_URL = 'https://marlonbarbershop.com/nationmusics/api';
const API_KEY = 'REDACTED_API_KEY';
const PREPARATION_TIMEOUT_MS = 8 * 60 * 1000;
const PREPARATION_POLL_MS = 2000;

let mainWindow;
const activePreparations = new Map();

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
    throw new Error(message || `Erro do servidor (${response.status}).`);
  }
  return body;
}

async function waitUntilPrepared(sourceId) {
  if (activePreparations.has(sourceId)) return activePreparations.get(sourceId);

  const operation = (async () => {
    await apiRequest(`/musicas/preparar/${encodeURIComponent(sourceId)}`, { method: 'POST' });
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

function streamUrl(song) {
  const sourceId = song.sourceId || song.id;
  return `nationmusic://stream/${encodeURIComponent(sourceId)}?title=${encodeURIComponent(song.title)}`;
}

async function handleAudioStream(request) {
  try {
    const requestedUrl = new URL(request.url);
    const sourceId = decodeURIComponent(requestedUrl.pathname.replace(/^\/+/, ''));
    const title = requestedUrl.searchParams.get('title') || 'Música';
    const session = await getSession();
    if (!session?.token) {
      return new Response('Sessão expirada.', { status: 401 });
    }

    const headers = {
      Accept: 'audio/mpeg',
      'X-API-KEY': API_KEY,
      Authorization: `Bearer ${session.token}`,
    };
    const range = request.headers.get('range');
    if (range) headers.Range = range;

    const response = await fetch(
      `${API_BASE_URL}/musicas/baixar/${encodeURIComponent(sourceId)}?titulo=${encodeURIComponent(title)}`,
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
ipcMain.handle('music:search', async (_event, query) => {
  const songs = await apiRequest(`/musicas/buscar?q=${encodeURIComponent(query)}`);
  return songs.map((song) => normalizeSong(song, false));
});
ipcMain.handle('music:prepare-stream', async (_event, rawSong) => {
  const song = normalizeSong(rawSong);
  if (!song.sourceId) throw new Error('Esta música não possui uma origem válida.');
  await waitUntilPrepared(song.sourceId);
  return streamUrl(song);
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
  const global = await apiRequest('/playlists/global');
  return [
    {
      id: 'most-downloaded',
      name: 'Mais ouvidas',
      description: 'As músicas mais salvas pela comunidade.',
    },
    ...global,
  ];
});
ipcMain.handle('playlists:songs', async (_event, id) => {
  const endpoint = id === 'most-downloaded'
    ? '/playlists/most-downloaded/songs'
    : `/playlists/${encodeURIComponent(id)}/songs`;
  const songs = await apiRequest(endpoint);
  return songs.map((song) => normalizeSong(song, false));
});

app.whenReady().then(async () => {
  protocol.handle('nationmusic', handleAudioStream);
  await createWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
