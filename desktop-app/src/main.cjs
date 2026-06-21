const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const API_BASE_URL = 'https://marlonbarbershop.com/nationmusics/api';
const API_KEY = 'REDACTED_API_KEY';
const PREPARATION_TIMEOUT_MS = 8 * 60 * 1000;
const PREPARATION_POLL_MS = 2000;

let mainWindow;
let activeDownloads = new Map();

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

async function getSettings() {
  const fallback = {
    musicDirectory: path.join(app.getPath('music'), 'NationMusics'),
  };
  return { ...fallback, ...(await readJson(dataPath('settings.json'), {})) };
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

function normalizeSong(song) {
  return {
    id: String(song.id ?? song.sourceId ?? randomUUID()),
    sourceId: String(song.sourceId ?? song.id ?? ''),
    title: String(song.title ?? song.titulo ?? 'Música'),
    artist: String(song.artist ?? song.artista ?? 'Artista desconhecido'),
    artworkUrl: song.artworkUrl ?? song.coverUrl ?? song.capa ?? '',
    serverId: Number.isFinite(Number(song.id)) ? Number(song.id) : undefined,
    filePath: song.filePath,
    coverPath: song.coverPath,
    downloadedAt: song.downloadedAt,
    sizeBytes: song.sizeBytes,
  };
}

function publicSong(song) {
  const normalized = normalizeSong(song);
  return {
    ...normalized,
    fileUrl: normalized.filePath && fs.existsSync(normalized.filePath)
      ? pathToFileURL(normalized.filePath).href
      : '',
    artworkUrl: normalized.coverPath && fs.existsSync(normalized.coverPath)
      ? pathToFileURL(normalized.coverPath).href
      : normalized.artworkUrl,
    downloaded: Boolean(normalized.filePath && fs.existsSync(normalized.filePath)),
  };
}

async function getLocalLibrary() {
  const library = await readJson(dataPath('library.json'), []);
  const valid = Array.isArray(library)
    ? library.filter((song) => song?.filePath && fs.existsSync(song.filePath))
    : [];
  if (valid.length !== library.length) await writeJson(dataPath('library.json'), valid);
  return valid;
}

async function saveLocalSong(song) {
  const library = await getLocalLibrary();
  const identity = song.sourceId || song.id;
  const next = [
    song,
    ...library.filter((candidate) => (candidate.sourceId || candidate.id) !== identity),
  ];
  await writeJson(dataPath('library.json'), next);
  return publicSong(song);
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

function safeFilePart(value) {
  return String(value || 'musica')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'musica';
}

function sendProgress(sourceId, payload) {
  if (!mainWindow?.isDestroyed()) {
    mainWindow.webContents.send('download:progress', { sourceId, ...payload });
  }
}

async function waitUntilPrepared(sourceId) {
  await apiRequest(`/musicas/preparar/${encodeURIComponent(sourceId)}`, { method: 'POST' });
  const startedAt = Date.now();
  while (Date.now() - startedAt < PREPARATION_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, PREPARATION_POLL_MS));
    const result = await apiRequest(`/musicas/preparar/${encodeURIComponent(sourceId)}/status`);
    if (result.status === 'ready') return;
    if (result.status === 'error') {
      throw new Error(result.message || 'Não foi possível preparar esta música.');
    }
    sendProgress(sourceId, { phase: 'preparing', progress: 0 });
  }
  throw new Error('A preparação demorou demais. Tente novamente mais tarde.');
}

async function downloadArtwork(url, destination) {
  if (!url || !/^https?:\/\//i.test(url)) return '';
  try {
    const response = await fetch(url);
    if (!response.ok) return '';
    const buffer = Buffer.from(await response.arrayBuffer());
    await fsp.writeFile(destination, buffer);
    return destination;
  } catch {
    return '';
  }
}

async function downloadSong(rawSong) {
  const song = normalizeSong(rawSong);
  if (!song.sourceId) throw new Error('Esta música não possui uma origem para download.');

  const existing = (await getLocalLibrary()).find(
    (candidate) => (candidate.sourceId || candidate.id) === song.sourceId
  );
  if (existing) return publicSong(existing);
  if (activeDownloads.has(song.sourceId)) return activeDownloads.get(song.sourceId);

  const operation = (async () => {
    const settings = await getSettings();
    await fsp.mkdir(settings.musicDirectory, { recursive: true });
    sendProgress(song.sourceId, { phase: 'preparing', progress: 0 });
    await waitUntilPrepared(song.sourceId);

    const session = await getSession();
    if (!session?.token) throw new Error('Sua sessão expirou. Entre novamente.');
    const fileName = `${safeFilePart(song.artist)} - ${safeFilePart(song.title)} [${safeFilePart(song.sourceId)}].mp3`;
    const destination = path.join(settings.musicDirectory, fileName);
    const partial = `${destination}.part`;
    const url = `${API_BASE_URL}/musicas/baixar/${encodeURIComponent(song.sourceId)}?titulo=${encodeURIComponent(song.title)}`;

    const response = await fetch(url, {
      headers: {
        Accept: 'audio/mpeg',
        'X-API-KEY': API_KEY,
        Authorization: `Bearer ${session.token}`,
      },
    });
    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      throw new Error(detail || `O download falhou (${response.status}).`);
    }

    const total = Number(response.headers.get('content-length') || 0);
    let written = 0;
    const output = fs.createWriteStream(partial);
    try {
      for await (const chunk of response.body) {
        await new Promise((resolve, reject) => {
          output.write(Buffer.from(chunk), (error) => error ? reject(error) : resolve());
        });
        written += chunk.byteLength;
        sendProgress(song.sourceId, {
          phase: 'downloading',
          progress: total > 0 ? Math.min(written / total, 1) : 0,
          written,
          total,
        });
      }
      await new Promise((resolve, reject) => output.end((error) => error ? reject(error) : resolve()));
      await fsp.rename(partial, destination);
    } catch (error) {
      output.destroy();
      await fsp.rm(partial, { force: true });
      throw error;
    }

    const coverPath = song.artworkUrl
      ? await downloadArtwork(
          song.artworkUrl,
          path.join(settings.musicDirectory, `${safeFilePart(song.sourceId)}.jpg`)
        )
      : '';
    const saved = {
      ...song,
      filePath: destination,
      coverPath,
      downloadedAt: Date.now(),
      sizeBytes: written,
    };
    const result = await saveLocalSong(saved);

    apiRequest('/songs/save', {
      method: 'POST',
      body: {
        title: song.title,
        artist: song.artist,
        uri: destination,
        coverUrl: song.artworkUrl,
        sourceId: song.sourceId,
      },
    }).catch(() => {});

    sendProgress(song.sourceId, { phase: 'done', progress: 1 });
    return result;
  })().finally(() => activeDownloads.delete(song.sourceId));

  activeDownloads.set(song.sourceId, operation);
  return operation;
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
  return songs.map(publicSong);
});
ipcMain.handle('music:download', (_event, song) => downloadSong(song));
ipcMain.handle('library:list', async () => {
  const local = await getLocalLibrary();
  let remote = [];
  try {
    remote = await apiRequest('/songs/my-library');
  } catch {}
  const merged = new Map();
  remote.map(normalizeSong).forEach((song) => merged.set(song.sourceId || song.id, song));
  local.map(normalizeSong).forEach((song) => merged.set(song.sourceId || song.id, song));
  return [...merged.values()].map(publicSong);
});
ipcMain.handle('library:remove-local', async (_event, sourceId) => {
  const library = await getLocalLibrary();
  const removed = library.find((song) => (song.sourceId || song.id) === sourceId);
  if (removed?.filePath) await fsp.rm(removed.filePath, { force: true });
  if (removed?.coverPath) await fsp.rm(removed.coverPath, { force: true });
  await writeJson(
    dataPath('library.json'),
    library.filter((song) => (song.sourceId || song.id) !== sourceId)
  );
  return true;
});
ipcMain.handle('playlists:list', async () => {
  const global = await apiRequest('/playlists/global');
  return [
    {
      id: 'most-downloaded',
      name: 'Mais ouvidas',
      description: 'As músicas mais baixadas pela comunidade.',
    },
    ...global,
  ];
});
ipcMain.handle('playlists:songs', async (_event, id) => {
  const endpoint = id === 'most-downloaded'
    ? '/playlists/most-downloaded/songs'
    : `/playlists/${encodeURIComponent(id)}/songs`;
  const songs = await apiRequest(endpoint);
  return songs.map(publicSong);
});
ipcMain.handle('settings:get', () => getSettings());
ipcMain.handle('settings:choose-directory', async () => {
  const settings = await getSettings();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Escolha onde salvar suas músicas',
    defaultPath: settings.musicDirectory,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return settings;
  const next = { ...settings, musicDirectory: result.filePaths[0] };
  await writeJson(dataPath('settings.json'), next);
  return next;
});
ipcMain.handle('app:open-folder', async () => {
  const settings = await getSettings();
  await fsp.mkdir(settings.musicDirectory, { recursive: true });
  shell.openPath(settings.musicDirectory);
  return true;
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
