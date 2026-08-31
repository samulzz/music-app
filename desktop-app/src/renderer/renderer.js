const state = {
  session: null,
  view: 'home',
  authMode: 'login',
  playlists: [],
  playlistsFetchedAt: 0,
  personalPlaylists: [],
  personalPlaylistsFetchedAt: 0,
  library: [],
  visibleSongs: [],
  spotifyPreview: null,
  spotifyUrl: '',
  queue: [],
  queueIndex: -1,
  queueRevision: 0,
  queueMode: 'idle',
  shuffleRemainingIndexes: [],
  recommendationContinuationInFlight: false,
  shuffle: false,
  shuffleNextIndex: -1,
  preparingSourceId: '',
  discordStatus: null,
  lastDiscordSyncAt: 0,
  trackLoadRequestId: 0,
  searchRequestId: 0,
  friendSearchRequestId: 0,
  friends: [],
  friendRequests: { incoming: [], outgoing: [] },
  friendSearchResults: [],
  friendSearchQuery: '',
  friendsFetchedAt: 0,
  lastFriendPresenceSyncAt: 0,
  jamSession: null,
  jamMode: '',
  jamStatus: '',
  jamJoinCode: '',
  currentJamCode: '',
  jamSyncInFlight: false,
  volumeSliderValue: 85,
  lastAudibleVolumeSliderValue: 85,
  connectState: null,
  connectProcessedRevision: 0,
  connectSyncInFlight: false,
};

const DISCORD_DEFAULT_CLIENT_ID = '1519319956796473544';
const preparedStreamUrls = new Map();
const pendingStreamPreparations = new Map();
const playlistDetailsCache = new Map();
const MAX_PREPARED_STREAMS = 120;
const VIEW_CACHE_TTL_MS = 5 * 60 * 1000;
const VOLUME_STORAGE_KEY = 'nationmusics.desktop.volumeSliderValue';
const VOLUME_CURVE = 1.6;
const SEARCH_DEBOUNCE_MS = 220;
const MUSIC_GENRES = [
  { name: 'Funk', query: 'funk', tone: 'green', icon: '🔥' },
  { name: 'Piseiro', query: 'piseiro', tone: 'orange', icon: '🪗' },
  { name: 'Sertanejo', query: 'sertanejo', tone: 'brown', icon: '🤠' },
  { name: 'Gospel', query: 'gospel', tone: 'blue', icon: '✨' },
  { name: 'Pagode', query: 'pagode', tone: 'purple', icon: '🥁' },
  { name: 'Trap', query: 'trap', tone: 'red', icon: '💎' },
  { name: 'Forró', query: 'forró', tone: 'yellow', icon: '🌵' },
  { name: 'Rap', query: 'rap', tone: 'teal', icon: '🎤' },
];
const FRIEND_PRESENCE_INTERVAL_MS = 20_000;
const FRIEND_LIST_REFRESH_MS = 20_000;
const JAM_SYNC_INTERVAL_MS = 2500;
const CONNECT_SYNC_INTERVAL_MS = 2500;
const CONNECT_DEVICE_ID_KEY = 'nationmusics.desktop.connectDeviceId';
let liveSearchTimer = null;
let friendPresenceTimer = null;
let friendListTimer = null;
let jamHostTimer = null;
let jamFollowTimer = null;
let connectSyncTimer = null;

const ICONS = {
  home: '<path d="M3 10.8 12 4l9 6.8" /><path d="M5.5 10v9h13v-9" /><path d="M10 19v-5h4v5" />',
  search: '<circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" />',
  spotify: '<circle cx="12" cy="12" r="9" /><path d="M7.8 9.5c3.3-1 6.5-.7 9.4.9" /><path d="M8.4 12.5c2.7-.8 5.2-.5 7.5.7" /><path d="M9 15.2c1.9-.5 3.8-.3 5.5.5" />',
  library: '<path d="M5 5v14" /><path d="M9 5v14" /><path d="M13 6.5v12" /><path d="m17 6 2.5 12" />',
  playlist: '<path d="M5 7h9" /><path d="M5 12h9" /><path d="M5 17h6" /><path d="M17 15.5v4l3-2z" />',
  users: '<circle cx="9" cy="8" r="3" /><path d="M3.5 19c.7-3 2.8-5 5.5-5s4.8 2 5.5 5" /><circle cx="17" cy="9" r="2.5" /><path d="M15.5 14.2c2.4.4 4.1 2.1 4.8 4.8" />',
  radio: '<circle cx="12" cy="12" r="2.5" /><path d="M7.8 16.2a6 6 0 0 1 0-8.4" /><path d="M16.2 7.8a6 6 0 0 1 0 8.4" /><path d="M4.9 19.1a10 10 0 0 1 0-14.2" /><path d="M19.1 4.9a10 10 0 0 1 0 14.2" />',
  discord: '<path d="M7.2 7.2c3.2-1.5 6.4-1.5 9.6 0 1.1 1.6 1.8 3.6 2.1 5.8-1.3 1.8-2.8 3-4.6 3.7l-1.1-1.5" /><path d="M16.8 7.2c-3.2-1.5-6.4-1.5-9.6 0-1.1 1.6-1.8 3.6-2.1 5.8 1.3 1.8 2.8 3 4.6 3.7l1.1-1.5" /><circle cx="9.3" cy="12.3" r="1" class="icon-fill" /><circle cx="14.7" cy="12.3" r="1" class="icon-fill" /><path d="M9.2 15c1.8.8 3.8.8 5.6 0" />',
  music: '<path d="M9 18V6l10-2v12" /><circle cx="7" cy="18" r="2.5" /><circle cx="17" cy="16" r="2.5" />',
  play: '<path class="icon-fill" d="M9 6.8v10.4L17.5 12z" />',
  pause: '<path class="icon-fill" d="M8 6.5h3v11H8z" /><path class="icon-fill" d="M13 6.5h3v11h-3z" />',
  'skip-back': '<path class="icon-fill" d="M11 12 19 6.5v11z" /><path d="M6 6v12" />',
  'skip-forward': '<path class="icon-fill" d="M13 12 5 6.5v11z" /><path d="M18 6v12" />',
  shuffle: '<path d="M4 7h2.5c4.5 0 6 10 11 10H20" /><path d="M17 14l3 3-3 3" /><path d="M4 17h2.5c1.3 0 2.4-.8 3.4-2" /><path d="M14.2 8.8c.9-1.1 2-1.8 3.3-1.8H20" /><path d="M17 4l3 3-3 3" />',
  volume: '<path d="M4 10v4h4l5 4V6l-5 4z" /><path d="M16 9c.8.8 1.2 1.8 1.2 3s-.4 2.2-1.2 3" />',
  'volume-high': '<path d="M4 10v4h4l5 4V6l-5 4z" /><path d="M16 8c1 1 1.5 2.3 1.5 4S17 15 16 16" /><path d="M18.5 5.5A8.5 8.5 0 0 1 21 12a8.5 8.5 0 0 1-2.5 6.5" />',
  'volume-low': '<path d="M4 10v4h4l5 4V6l-5 4z" /><path d="M16 9.5c.6.6.9 1.4.9 2.5s-.3 1.9-.9 2.5" />',
  'volume-muted': '<path d="M4 10v4h4l5 4V6l-5 4z" /><path d="m17 9 4 6" /><path d="m21 9-4 6" />',
  plus: '<path d="M12 5v14" /><path d="M5 12h14" />',
  close: '<path d="m7 7 10 10" /><path d="m17 7-10 10" />',
  check: '<path d="m5 12 4 4 10-10" />',
  download: '<path d="M12 4v10" /><path d="m8 10 4 4 4-4" /><path d="M5 19h14" />',
  'arrow-right': '<path d="M5 12h14" /><path d="m13 6 6 6-6 6" />',
  link: '<path d="M10 7.5 11.5 6a4 4 0 0 1 5.7 5.7L15.5 13" /><path d="m14 16.5-1.5 1.5a4 4 0 0 1-5.7-5.7L8.5 11" /><path d="m9 15 6-6" />',
  clock: '<circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" />',
  alert: '<path d="M12 4 3.5 19h17z" /><path d="M12 9v4" /><path d="M12 16h.01" />',
  devices: '<rect x="3" y="5" width="13" height="10" rx="1.5" /><path d="M7 19h5M9.5 15v4" /><rect x="17" y="8" width="4" height="9" rx="1" />',
  logout: '<path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" /><path d="M14 8l4 4-4 4" /><path d="M9 12h9" />',
};

function icon(name, className = '') {
  const body = ICONS[name] || ICONS.music;
  return `<svg class="app-icon${className ? ` ${className}` : ''}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

function genreGridMarkup() {
  return `<div class="genre-grid">
    ${MUSIC_GENRES.map((genre) => `<button class="genre-card genre-${genre.tone}" data-genre-query="${escapeHtml(genre.query)}" type="button"><span>${genre.icon}</span><strong>${escapeHtml(genre.name)}</strong></button>`).join('')}
  </div>`;
}

function bindGenreActions() {
  document.querySelectorAll('[data-genre-query]').forEach((button) => {
    button.addEventListener('click', () => {
      const query = String(button.dataset.genreQuery || '');
      $('#search-input').value = query;
      activateNavigation('search');
      void renderSearch(query);
    });
  });
}

function normalizeCatalogText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function renderIconSlots(root = document) {
  root.querySelectorAll('[data-icon]').forEach((slot) => {
    slot.innerHTML = icon(slot.dataset.icon || 'music');
  });
}

if (!window.nation && location.hostname === '127.0.0.1') {
  const demoSongs = [
    {
      id: 'demo-1',
      serverId: 1,
      sourceId: 'demo-1',
      title: 'Noite Perfeita',
      artist: 'Nation Sessions',
      artworkUrl: '',
      saved: true,
    },
    {
      id: 'demo-2',
      sourceId: 'demo-2',
      title: 'Entrelinhas',
      artist: 'Boaventura',
      artworkUrl: '',
      saved: false,
    },
  ];
  window.nation = {
    getSession: async () => ({ token: 'preview', username: 'samulsz' }),
    login: async ({ username }) => ({ token: 'preview', username }),
    register: async ({ username }) => ({ token: 'preview', username }),
    logout: async () => true,
    search: async () => demoSongs,
    prepareStream: async () => '',
    downloadSong: async () => true,
    isSongDownloaded: async (song) => Boolean(song.downloaded),
    previewSpotify: async () => ({
      spotifyId: 'demo-spotify',
      type: 'playlist',
      name: 'Playlist do Spotify',
      coverUrl: '',
      totalTracks: demoSongs.length,
      truncated: false,
      tracks: demoSongs.map((song) => ({
        spotifyId: song.id,
        title: song.title,
        artist: song.artist,
        durationMs: 180000,
      })),
    }),
    getLibrary: async () => demoSongs.filter((song) => song.saved),
    saveToLibrary: async (song) => ({ ...song, saved: true }),
    removeFromLibrary: async () => true,
    getPlaylists: async () => [
      { id: 'most-downloaded', name: 'Mais ouvidas', description: 'As favoritas da comunidade.' },
      { id: '1', name: 'Pra dirigir', description: 'Uma seleção leve para seguir viagem.' },
      { id: '2', name: 'Brasil agora', description: 'Sons brasileiros em destaque.' },
      { id: '3', name: 'Fim de noite', description: 'Música baixa, luz apagada.' },
    ],
    getPlaylistSongs: async () => demoSongs,
    getPersonalPlaylists: async () => [{ id: 10, name: 'Minha playlist', description: 'Criada por você.' }],
    getPersonalPlaylistSongs: async () => demoSongs.filter((song) => song.saved),
    createPersonalPlaylist: async (playlist) => ({ id: Date.now(), ...playlist, songs: [] }),
    updatePersonalPlaylist: async (playlistId, playlist) => ({ id: playlistId, ...playlist }),
    deletePersonalPlaylist: async () => true,
    addSongToPersonalPlaylist: async () => true,
    removeSongFromPersonalPlaylist: async () => true,
    getFriends: async () => [
      {
        username: 'leonardo',
        online: true,
        listening: true,
        lastSeenAt: Date.now(),
        presence: {
          song: demoSongs[0],
          playing: true,
          positionSeconds: 42,
        },
      },
    ],
    searchFriends: async (query) => query ? [{ username: query, friend: false, requestPending: false }] : [],
    getFriendRequests: async () => ({ incoming: [], outgoing: [] }),
    sendFriendRequest: async () => true,
    acceptFriendRequest: async () => true,
    declineFriendRequest: async () => true,
    removeFriend: async () => true,
    updateFriendPresence: async () => true,
    clearFriendPresence: async () => true,
    updateConnectPlayback: async (payload) => ({ activeDeviceId: payload.deviceId, currentDeviceActive: true, devices: [{ deviceId: payload.deviceId, deviceName: 'Este computador', platform: 'desktop', active: true }], song: payload.song, positionSeconds: payload.positionSeconds, durationSeconds: payload.durationSeconds, playing: payload.playing, volumeLevel: payload.volumeLevel, stateUpdatedAt: Date.now(), commandAction: '', commandValue: 0, commandRevision: 0, serverTime: Date.now() }),
    controlConnectPlayback: async () => state.connectState,
    createJam: async (payload) => ({
      code: 'ABC123',
      inviteLink: 'nationmusics:///jam/ABC123',
      hostUsername: 'samulsz',
      participants: ['samulsz'],
      state: {
        song: payload.song,
        positionSeconds: payload.positionSeconds || 0,
        playing: Boolean(payload.playing),
        updatedAt: Date.now(),
      },
      serverTime: Date.now(),
    }),
    joinJam: async (code) => ({
      code,
      inviteLink: `nationmusics:///jam/${code}`,
      hostUsername: 'leonardo',
      participants: ['leonardo', 'samulsz'],
      state: {
        song: {
          id: demoSongs[0].id,
          sourceId: demoSongs[0].sourceId,
          title: demoSongs[0].title,
          artist: demoSongs[0].artist,
          artworkUrl: demoSongs[0].artworkUrl,
        },
        positionSeconds: 12,
        playing: true,
        updatedAt: Date.now(),
      },
      serverTime: Date.now(),
    }),
    getJam: async (code) => window.nation.joinJam(code),
    updateJamState: async (code, payload) => window.nation.createJam(payload).then((session) => ({ ...session, code })),
    leaveJam: async () => true,
    copyText: async () => true,
    getDiscordStatus: async () => ({ supported: true, enabled: false, configured: false, connected: false, state: 'disabled' }),
    configureDiscord: async () => ({ supported: true, enabled: false, configured: false, connected: false, state: 'disabled' }),
    updateDiscordActivity: async () => ({ supported: true, enabled: false, configured: false, connected: false, state: 'disabled' }),
    clearDiscordActivity: async () => ({ supported: true, enabled: false, configured: false, connected: false, state: 'disabled' }),
    checkForUpdate: async () => ({ status: 'current', required: false, offline: false, currentVersion: 'preview' }),
    openUpdateDownload: async () => true,
  };
}

const $ = (selector) => document.querySelector(selector);
const authScreen = $('#auth-screen');
const appShell = $('#app-shell');
const contentView = $('#content-view');
const audio = $('#audio');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function volumeSliderToAudioVolume(sliderValue) {
  const normalized = clamp(Number(sliderValue) || 0, 0, 100) / 100;
  return clamp(normalized ** VOLUME_CURVE, 0, 1);
}

function updateVolumeUi() {
  const slider = $('#volume');
  const label = $('#volume-value');
  const button = $('#mute-button');
  if (!slider || !label || !button) return;

  const sliderValue = Math.round(clamp(state.volumeSliderValue, 0, 100));
  slider.value = String(sliderValue);
  slider.style.setProperty('--volume-fill', `${sliderValue}%`);
  label.textContent = `${sliderValue}%`;

  const iconName = sliderValue === 0
    ? 'volume-muted'
    : sliderValue < 45
      ? 'volume-low'
      : 'volume-high';
  button.innerHTML = icon(iconName);
  button.title = sliderValue === 0 ? 'Restaurar volume' : 'Mutar';
  button.setAttribute('aria-label', button.title);
}

function removeUpdateGate() {
  document.querySelector('.update-gate')?.remove();
}

function showRequiredUpdateGate(result) {
  removeUpdateGate();
  const target = result?.target || {};
  const gate = document.createElement('section');
  gate.className = 'update-gate';
  gate.innerHTML = `
    <div class="update-gate-panel">
      <div class="brand-mark">N</div>
      <h1>Atualizacao obrigatoria</h1>
      <p>${escapeHtml(target.message || 'Existe uma atualizacao obrigatoria para continuar usando o NationMusics.')}</p>
      <div class="update-version-box">
        <span>Sua versao</span>
        <strong>${escapeHtml(result.currentVersion || 'instalada')}</strong>
        <span>Nova versao</span>
        <strong>${escapeHtml(target.version || 'disponivel')}</strong>
      </div>
      <div class="update-gate-actions">
        <button class="primary-button" type="button" data-update-download>Atualizar agora</button>
        <button class="secondary-button" type="button" data-update-retry>Tentar novamente</button>
      </div>
    </div>
  `;
  document.body.appendChild(gate);

  gate.querySelector('[data-update-download]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Baixando atualizacao...';
    try {
      await window.nation.openUpdateDownload(target.url);
      button.textContent = 'Abrindo instalador...';
    } catch (error) {
      showBanner(error.message || 'Nao foi possivel baixar a atualizacao.', true);
      button.disabled = false;
      button.textContent = 'Atualizar agora';
      return;
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = 'Atualizar agora';
      }
    }
  });

  gate.querySelector('[data-update-retry]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Verificando...';
    try {
      const nextResult = await window.nation.checkForUpdate();
      if (!nextResult?.required) {
        removeUpdateGate();
        const session = await window.nation.getSession();
        if (session?.token) await showApp(session);
        else showAuth();
        return;
      }
      showRequiredUpdateGate(nextResult);
    } finally {
      button.disabled = false;
      button.textContent = 'Tentar novamente';
    }
  });
}

async function enforceRequiredUpdate() {
  try {
    const result = await window.nation.checkForUpdate();
    if (result?.required) {
      showRequiredUpdateGate(result);
      return true;
    }
  } catch {}
  return false;
}

function setVolumeFromSlider(value, { persist = true } = {}) {
  const sliderValue = Math.round(clamp(Number(value) || 0, 0, 100));
  state.volumeSliderValue = sliderValue;
  if (sliderValue > 0) state.lastAudibleVolumeSliderValue = sliderValue;
  audio.volume = volumeSliderToAudioVolume(sliderValue);
  updateVolumeUi();
  if (persist) {
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, String(sliderValue));
    } catch {
      // Ignore storage errors; volume still works for this session.
    }
  }
}

function restoreSavedVolume() {
  let savedVolume = 85;
  try {
    savedVolume = Number(localStorage.getItem(VOLUME_STORAGE_KEY) || 85);
  } catch {
    savedVolume = 85;
  }
  setVolumeFromSlider(savedVolume, { persist: false });
}

function songIdentity(song) {
  return String(song?.spotifyId || song?.sourceId || song?.id || '');
}

function rememberPreparedStream(key, url) {
  if (!key || !url) return;
  preparedStreamUrls.set(key, url);
  while (preparedStreamUrls.size > MAX_PREPARED_STREAMS) {
    const oldestKey = preparedStreamUrls.keys().next().value;
    preparedStreamUrls.delete(oldestKey);
  }
}

function isPrepared(song) {
  const key = songIdentity(song);
  return Boolean(key && preparedStreamUrls.has(key));
}

async function prepareStreamCached(song) {
  const key = songIdentity(song);
  if (!key) return window.nation.prepareStream(song);
  if (preparedStreamUrls.has(key)) return preparedStreamUrls.get(key);
  if (pendingStreamPreparations.has(key)) return pendingStreamPreparations.get(key);

  const operation = window.nation.prepareStream(song)
    .then((url) => {
      rememberPreparedStream(key, url);
      return url;
    })
    .finally(() => {
      pendingStreamPreparations.delete(key);
    });

  pendingStreamPreparations.set(key, operation);
  return operation;
}

function randomQueueIndex(exceptIndex = state.queueIndex) {
  if (state.queue.length <= 1) return exceptIndex;
  let next = exceptIndex;
  while (next === exceptIndex) {
    next = Math.floor(Math.random() * state.queue.length);
  }
  return next;
}

function resetShuffleRemainingIndexes() {
  state.shuffleRemainingIndexes = state.queue
    .map((_song, index) => index)
    .filter((index) => index !== state.queueIndex);
}

function plannedNextQueueIndex() {
  if (!state.queue.length) return -1;
  if (!state.shuffle) {
    if (state.queueMode === 'selection' && state.queueIndex >= state.queue.length - 1) return -1;
    return (state.queueIndex + 1 + state.queue.length) % state.queue.length;
  }

  if (state.queueMode === 'selection' && !state.shuffleRemainingIndexes.length) return -1;

  const planned = state.shuffleNextIndex;
  if (
    Number.isInteger(planned)
    && planned >= 0
    && planned < state.queue.length
    && planned !== state.queueIndex
    && (state.queueMode !== 'selection' || state.shuffleRemainingIndexes.includes(planned))
  ) {
    return planned;
  }

  state.shuffleNextIndex = state.queueMode === 'selection'
    ? state.shuffleRemainingIndexes[Math.floor(Math.random() * state.shuffleRemainingIndexes.length)]
    : randomQueueIndex();
  return state.shuffleNextIndex;
}

function prefetchNextTrack() {
  if (state.queue.length <= 1) return;
  const index = plannedNextQueueIndex();
  const song = state.queue[index];
  if (!song || isPrepared(song)) return;

  void resolvePlayableSong(song)
    .then((resolved) => prepareStreamCached(resolved))
    .catch((error) => {
      if (isAuthenticationError(error)) void handleAuthenticationError(error);
    });
}

function updateShuffleButton() {
  const button = $('#shuffle-button');
  if (button) {
    button.classList.toggle('active', state.shuffle);
    button.setAttribute('aria-pressed', String(state.shuffle));
    button.title = state.shuffle ? 'Aleatório ativado' : 'Aleatório';
  }
  const label = $('#shuffle-label');
  if (label) label.textContent = state.shuffle ? 'Aleatório ligado' : 'Aleatório';

  document.querySelectorAll('[data-shuffle-toggle]').forEach((toggle) => {
    toggle.classList.toggle('active', state.shuffle);
    toggle.setAttribute('aria-pressed', String(state.shuffle));
    toggle.title = state.shuffle ? 'Aleatório ativado' : 'Aleatório';
    const text = toggle.querySelector('[data-shuffle-label]');
    if (text) text.textContent = state.shuffle ? 'Aleatório ligado' : 'Aleatório';
  });
}

function setPlayButtonIcon(playing) {
  const button = $('#play-button');
  if (!button) return;
  button.innerHTML = icon(playing ? 'pause' : 'play');
  button.title = playing ? 'Pausar' : 'Reproduzir';
}

function setShuffleMode(enabled, _notify = true) {
  state.shuffle = Boolean(enabled);
  state.shuffleNextIndex = -1;
  if (state.shuffle && state.queueMode === 'selection') resetShuffleRemainingIndexes();
  else state.shuffleRemainingIndexes = [];
  updateShuffleButton();
  prefetchNextTrack();
}

function toggleShuffleMode(notify = true) {
  setShuffleMode(!state.shuffle, notify);
}

function showBanner(message, error = false) {
  const banner = $('#status-banner');
  if (!error) {
    clearTimeout(showBanner.timer);
    banner.className = 'status-banner hidden';
    banner.textContent = '';
    return;
  }
  banner.textContent = message;
  banner.className = `status-banner${error ? ' error' : ''}`;
  clearTimeout(showBanner.timer);
  showBanner.timer = setTimeout(() => banner.classList.add('hidden'), 5000);
}

function isAuthenticationError(error) {
  const message = String(error?.message || error || '');
  return /sess[aã]o expirada|token ausente|token inv[aá]lido|token invalido|unauthorized|forbidden|401|403/i.test(message);
}

async function handleAuthenticationError(error) {
  if (!isAuthenticationError(error)) return false;

  try {
    audio.pause();
    audio.removeAttribute('src');
    await window.nation.clearDiscordActivity();
    await window.nation.logout();
  } catch {}

  state.queue = [];
  state.queueIndex = -1;
  state.queueRevision += 1;
  state.queueMode = 'idle';
  state.shuffleRemainingIndexes = [];
  state.shuffleNextIndex = -1;
  pendingStreamPreparations.clear();
  showAuth('Sua sessão expirou. Entre novamente.');
  return true;
}

function discordLabel(status) {
  if (!status) return 'Carregando...';
  if (status.state === 'connected') return 'Conectado';
  if (status.state === 'connecting') return 'Conectando...';
  if (status.state === 'disabled') return 'Desativado';
  if (status.state === 'needs_config') return 'Configurar';
  if (status.state === 'error') return 'Erro/fechado';
  return status.configured ? 'Pronto' : 'Configurar';
}

function updateDiscordUi(status) {
  state.discordStatus = status;
  const button = $('#discord-button');
  const label = $('#discord-label');
  const dot = $('#discord-dot');
  if (!button || !label || !dot) return;

  label.textContent = discordLabel(status);
  button.classList.toggle('connected', status?.state === 'connected');
  button.classList.toggle('needs-config', !status?.configured && status?.enabled !== false);
  button.classList.toggle('error', status?.state === 'error');
  dot.title = status?.message || '';
  const topButton = $('#top-discord-button');
  const topDot = $('#top-discord-dot');
  topButton?.classList.toggle('connected', status?.state === 'connected');
  topButton?.classList.toggle('needs-config', !status?.configured && status?.enabled !== false);
  topButton?.classList.toggle('error', status?.state === 'error');
  if (topButton) topButton.title = `Discord: ${discordLabel(status)}`;
  if (topDot) topDot.title = status?.message || '';
}

async function refreshDiscordStatus() {
  try {
    const status = await window.nation.getDiscordStatus();
    updateDiscordUi(status);
  } catch {
    updateDiscordUi({
      enabled: false,
      configured: false,
      connected: false,
      state: 'error',
      message: 'Discord indisponível.',
    });
  }
}

async function configureDiscord() {
  const current = state.discordStatus || await window.nation.getDiscordStatus().catch(() => null);
  const clientId = current?.clientId || DISCORD_DEFAULT_CLIENT_ID;
  try {
    const status = await window.nation.configureDiscord({
      enabled: true,
      clientId,
    });
    updateDiscordUi(status);
    showBanner(status.connected
      ? 'Discord conectado. O status será atualizado quando a música tocar.'
      : 'Tentando conectar ao Discord. Deixe o Discord aberto no PC.');
    await syncDiscordActivity(true);
  } catch (error) {
    showBanner(error.message || 'Não foi possível configurar o Discord.', true);
  }
}

function currentDiscordPayload(playing = !audio.paused) {
  const remote = state.connectState && !state.connectState.currentDeviceActive && state.connectState.song;
  if (remote) {
    return {
      playing: Boolean(state.connectState.playing),
      positionSeconds: connectEffectivePosition(state.connectState),
      durationSeconds: Math.max(0, Number(state.connectState.durationSeconds) || 0),
      song: state.connectState.song,
    };
  }
  const song = state.queue[state.queueIndex];
  return {
    playing: Boolean(song && playing && audio.src),
    positionSeconds: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
    durationSeconds: Number.isFinite(audio.duration) ? audio.duration : 0,
    song: song || null,
  };
}

async function syncDiscordActivity(force = false) {
  const now = Date.now();
  if (!force && now - state.lastDiscordSyncAt < 15_000) return;
  state.lastDiscordSyncAt = now;

  try {
    const payload = currentDiscordPayload();
    const status = payload.playing
      ? await window.nation.updateDiscordActivity(payload)
      : await window.nation.clearDiscordActivity();
    updateDiscordUi(status);
  } catch {}
}

function currentFriendPresencePayload() {
  const song = state.queue[state.queueIndex] || null;
  const playing = Boolean(song && audio.src && !audio.paused && !audio.ended);
  return {
    playing,
    positionSeconds: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
    activeJamCode: state.currentJamCode || '',
    song: song
      ? {
          id: String(song.id || song.sourceId || ''),
          sourceId: String(song.sourceId || ''),
          title: String(song.title || 'Musica'),
          artist: String(song.artist || 'Artista desconhecido'),
          artworkUrl: String(song.artworkUrl || ''),
          remoteUrl: '',
        }
      : null,
  };
}

function connectDeviceId() {
  let deviceId = '';
  try { deviceId = localStorage.getItem(CONNECT_DEVICE_ID_KEY) || ''; } catch {}
  if (!deviceId) {
    deviceId = `desktop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    try { localStorage.setItem(CONNECT_DEVICE_ID_KEY, deviceId); } catch {}
  }
  return deviceId;
}

function currentConnectSong() {
  const song = state.queue[state.queueIndex];
  if (!song) return null;
  return {
    id: String(song.serverId || song.id || song.sourceId || ''),
    sourceId: String(song.sourceId || ''),
    title: String(song.title || 'Musica'),
    artist: String(song.artist || 'Artista desconhecido'),
    artworkUrl: String(song.artworkUrl || ''),
    remoteUrl: String(song.remoteUrl || ''),
  };
}

function connectEffectivePosition(remoteState) {
  if (!remoteState) return 0;
  const elapsed = remoteState.playing ? Math.max(0, (Date.now() - Number(remoteState.stateUpdatedAt || Date.now())) / 1000) : 0;
  return Math.max(0, Number(remoteState.positionSeconds || 0) + elapsed);
}

function renderConnectState() {
  const connect = state.connectState;
  const panel = $('#connect-panel');
  const devices = $('#connect-devices');
  if (devices) {
    devices.innerHTML = (connect?.devices || []).map((device) => `
      <div class="connect-device${device.active ? ' active' : ''}">
        ${icon(device.platform === 'desktop' ? 'devices' : 'volume')}
        <div><strong>${escapeHtml(device.deviceName || 'Dispositivo')}</strong><small>${device.active ? 'Reproduzindo aqui' : 'Disponivel'}</small></div>
        ${device.active ? icon('volume-high') : ''}
      </div>
    `).join('') || '<div class="connect-empty">Procurando dispositivos...</div>';
  }
  $('#connect-takeover')?.classList.toggle('hidden', !connect || connect.currentDeviceActive);
  $('#connect-button')?.classList.toggle('active', Boolean(connect && !connect.currentDeviceActive));
  if (!connect?.currentDeviceActive && connect?.song) {
    $('#player-title').textContent = connect.song.title || 'Reproduzindo';
    const activeName = connect.devices?.find((device) => device.active)?.deviceName || 'outro dispositivo';
    $('#player-artist').textContent = `${connect.song.artist || ''} - em ${activeName}`;
    $('#player-cover').innerHTML = connect.song.artworkUrl ? `<img src="${escapeHtml(connect.song.artworkUrl)}" alt="" />` : icon('music');
    $('#current-time').textContent = formatTime(connectEffectivePosition(connect));
    $('#duration').textContent = formatTime(Number(connect.durationSeconds) || 0);
    $('#seek').value = Number(connect.durationSeconds) > 0 ? String((connectEffectivePosition(connect) / Number(connect.durationSeconds)) * 100) : '0';
    setPlayButtonIcon(Boolean(connect.playing));
    const remoteSlider = Math.round((clamp(Number(connect.volumeLevel) || 0, 0, 1) ** (1 / VOLUME_CURVE)) * 100);
    state.volumeSliderValue = remoteSlider;
    updateVolumeUi();
  }
  if (panel && panel.classList.contains('hidden')) return;
}

async function executeConnectCommand(connect) {
  if (!connect?.currentDeviceActive || !connect.commandAction || connect.commandRevision <= state.connectProcessedRevision) return;
  const action = connect.commandAction;
  if (action === 'SYNC' && connect.song) {
    const local = currentConnectSong();
    if (songIdentity(local) !== songIdentity(connect.song)) {
      state.queue = [{ ...connect.song, id: connect.song.id || connect.song.sourceId }];
      state.queueIndex = 0;
      state.queueRevision += 1;
      state.queueMode = 'external';
      state.shuffleRemainingIndexes = [];
      await loadCurrentTrack();
    }
    if (Number.isFinite(connect.positionSeconds)) audio.currentTime = Math.max(0, Number(connect.positionSeconds));
    setVolumeFromSlider((clamp(Number(connect.volumeLevel) || 0, 0, 1) ** (1 / VOLUME_CURVE)) * 100);
    if (connect.playing) await audio.play(); else audio.pause();
  } else if (action === 'PLAY') await audio.play();
  else if (action === 'PAUSE') audio.pause();
  else if (action === 'NEXT') nextTrack(1);
  else if (action === 'PREVIOUS') nextTrack(-1);
  else if (action === 'SEEK' && Number.isFinite(connect.commandValue)) audio.currentTime = Math.max(0, Number(connect.commandValue));
  else if (action === 'VOLUME') setVolumeFromSlider((clamp(Number(connect.commandValue) || 0, 0, 1) ** (1 / VOLUME_CURVE)) * 100);
  state.connectProcessedRevision = Math.max(state.connectProcessedRevision, Number(connect.commandRevision) || 0);
}

async function syncConnectPlayback() {
  if (!state.session?.token || state.connectSyncInFlight) return;
  state.connectSyncInFlight = true;
  try {
    const connect = await window.nation.updateConnectPlayback({
      deviceId: connectDeviceId(),
      deviceName: 'Este computador',
      platform: 'desktop',
      song: currentConnectSong(),
      positionSeconds: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      durationSeconds: Number.isFinite(audio.duration) ? audio.duration : 0,
      playing: Boolean(audio.src && !audio.paused && !audio.ended),
      volumeLevel: audio.volume,
      processedCommandRevision: state.connectProcessedRevision,
    });
    state.connectState = connect;
    if (!connect.currentDeviceActive && !audio.paused) audio.pause();
    await executeConnectCommand(connect);
    renderConnectState();
    void syncDiscordActivity();
  } catch (error) {
    if (isAuthenticationError(error)) await handleAuthenticationError(error);
  } finally {
    state.connectSyncInFlight = false;
  }
}

async function controlConnectPlayback(action, value) {
  try {
    const connect = await window.nation.controlConnectPlayback({ deviceId: connectDeviceId(), action, value });
    state.connectState = connect;
    renderConnectState();
    return connect;
  } catch (error) {
    showBanner(error.message || 'Nao foi possivel controlar o outro dispositivo.', true);
    return null;
  }
}

function startConnectSync() {
  window.clearInterval(connectSyncTimer);
  connectSyncTimer = window.setInterval(() => void syncConnectPlayback(), CONNECT_SYNC_INTERVAL_MS);
  void syncConnectPlayback();
}

function stopConnectSync() {
  window.clearInterval(connectSyncTimer);
  connectSyncTimer = null;
  state.connectState = null;
  state.connectProcessedRevision = 0;
}

async function syncFriendPresence(force = false) {
  if (!state.session?.token) return;
  const now = Date.now();
  if (!force && now - state.lastFriendPresenceSyncAt < FRIEND_PRESENCE_INTERVAL_MS) return;
  state.lastFriendPresenceSyncAt = now;

  try {
    await window.nation.updateFriendPresence(currentFriendPresencePayload());
  } catch (error) {
    if (isAuthenticationError(error)) await handleAuthenticationError(error);
  }
}

function startFriendPresenceHeartbeat() {
  window.clearInterval(friendPresenceTimer);
  friendPresenceTimer = window.setInterval(() => {
    void syncFriendPresence();
  }, FRIEND_PRESENCE_INTERVAL_MS);
  void syncFriendPresence(true);
}

async function clearFriendPresence() {
  try {
    await window.nation.clearFriendPresence();
  } catch {}
}

function stopFriendPresenceHeartbeat(clearRemote = true) {
  window.clearInterval(friendPresenceTimer);
  friendPresenceTimer = null;
  state.lastFriendPresenceSyncAt = 0;
  if (clearRemote) void clearFriendPresence();
}

function startFriendListRefresh() {
  window.clearInterval(friendListTimer);
  friendListTimer = window.setInterval(() => {
    if (state.view === 'friends') void refreshFriendsPanel(false);
  }, FRIEND_LIST_REFRESH_MS);
}

function stopFriendListRefresh() {
  window.clearInterval(friendListTimer);
  friendListTimer = null;
}

function normalizeJamCode(value) {
  const text = String(value || '').trim();
  const linkMatch = text.match(/jam\/([A-Za-z0-9]+)/i);
  const rawCode = linkMatch ? linkMatch[1] : text;
  return rawCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function currentJamSong() {
  const song = state.queue[state.queueIndex];
  const sourceId = String(song?.sourceId || song?.id || '').trim();
  if (!song || !sourceId) return null;
  return {
    id: String(song.id || sourceId),
    sourceId,
    title: String(song.title || 'Musica'),
    artist: String(song.artist || 'Artista desconhecido'),
    artworkUrl: String(song.artworkUrl || ''),
    remoteUrl: '',
  };
}

function currentJamPayload() {
  const song = currentJamSong();
  if (!song) return null;
  return {
    song,
    positionSeconds: Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0,
    playing: Boolean(audio.src && !audio.paused && !audio.ended),
  };
}

function jamSongToDesktopSong(song) {
  return {
    id: song.id || song.sourceId,
    sourceId: song.sourceId || song.id,
    title: song.title || 'Musica',
    artist: song.artist || 'Artista desconhecido',
    artworkUrl: song.artworkUrl || '',
    remoteUrl: song.remoteUrl || '',
    saved: false,
  };
}

function isSameJamSong(song) {
  const current = state.queue[state.queueIndex];
  const currentSourceId = String(current?.sourceId || current?.id || '');
  const targetSourceId = String(song?.sourceId || song?.id || '');
  return Boolean(currentSourceId && targetSourceId && currentSourceId === targetSourceId);
}

function predictedJamPosition(session) {
  const playback = session?.state;
  if (!playback) return 0;
  const serverTime = Number(session.serverTime || Date.now());
  const updatedAt = Number(playback.updatedAt || serverTime);
  const offset = playback.playing ? Math.max(0, (serverTime - updatedAt) / 1000) : 0;
  return Math.max(0, Number(playback.positionSeconds || 0) + offset);
}

async function syncToJamSession(session) {
  const playback = session?.state;
  const song = playback?.song;
  if (!song?.sourceId && !song?.id) return;

  const sameSong = isSameJamSong(song);
  if (!sameSong) {
    state.queue = [jamSongToDesktopSong(song)];
    state.queueIndex = 0;
    state.queueRevision += 1;
    state.queueMode = 'external';
    state.shuffleRemainingIndexes = [];
    state.shuffleNextIndex = -1;
    await loadCurrentTrack();
  }

  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  const predicted = predictedJamPosition(session);
  const targetPosition = duration > 0
    ? Math.min(predicted, Math.max(0, duration - 1))
    : predicted;
  if (Number.isFinite(targetPosition) && Math.abs((audio.currentTime || 0) - targetPosition) > 2.5) {
    try {
      audio.currentTime = targetPosition;
    } catch {}
  }

  try {
    if (playback.playing && audio.paused) await audio.play();
    if (!playback.playing && !audio.paused) audio.pause();
  } catch {}
}

function renderJam() {
  state.view = 'jam';
  setPageHeader('JAM', state.currentJamCode ? `Codigo ${state.currentJamCode}` : 'Escute junto.');
  const session = state.jamSession;
  const playback = session?.state;
  const participants = Array.isArray(session?.participants) ? session.participants : [];
  const inviteText = session
    ? `Entre na minha JAM do NationMusics: ${session.inviteLink}\nCodigo: ${session.code}`
    : '';

  contentView.innerHTML = `
    <div class="jam-panel">
      <section class="jam-hero">
        <div>
          <p>${icon('radio')} JAM</p>
          <h2>${session ? `Codigo ${escapeHtml(session.code)}` : 'Criar ou entrar em uma JAM'}</h2>
          <span>${escapeHtml(state.jamStatus || 'Toque uma musica para criar uma sala ou entre pelo codigo de alguem.')}</span>
        </div>
        <div class="jam-actions">
          <button id="create-jam-button" class="primary-button" type="button">${icon('radio')} Criar JAM</button>
          <button id="leave-jam-button" class="secondary-button" type="button" ${session ? '' : 'disabled'}>${icon('close')} Sair</button>
        </div>
      </section>

      <section class="jam-grid">
        <article class="jam-now">
          <div class="jam-cover">
            ${playback?.song?.artworkUrl ? `<img src="${escapeHtml(playback.song.artworkUrl)}" alt="" />` : icon('music')}
          </div>
          <strong>${escapeHtml(playback?.song?.title || 'Nenhuma JAM ativa')}</strong>
          <span>${escapeHtml(playback?.song?.artist || 'Aguardando musica')}</span>
          ${session ? `<small>${participants.length} conectado${participants.length === 1 ? '' : 's'} - ${state.jamMode === 'host' ? 'voce controla' : 'seguindo anfitriao'}</small>` : ''}
        </article>

        <article class="jam-card">
          <h3>Entrar por codigo</h3>
          <form id="join-jam-form" class="jam-code-form">
            <input id="jam-code-input" value="${escapeHtml(state.jamJoinCode)}" placeholder="Codigo ou link da JAM" autocomplete="off" />
            <button class="primary-button compact" type="submit">${icon('arrow-right')} Entrar</button>
          </form>
          <div class="jam-card-actions">
            <button id="copy-jam-button" class="secondary-button compact" type="button" data-invite="${escapeHtml(inviteText)}" ${session ? '' : 'disabled'}>${icon('link')} Copiar convite</button>
          </div>
        </article>
      </section>
    </div>
  `;
  bindJamActions();
}

function renderJamPlayerPanel() {
  const panel = $('#jam-player-panel');
  if (!panel) return;
  const session = state.jamSession;
  const playback = session?.state;
  const participants = Array.isArray(session?.participants) ? session.participants : [];
  panel.innerHTML = `
    <div class="jam-player-head">
      <div><span>${icon('radio')} JAM</span><strong>${session ? `Codigo ${escapeHtml(session.code)}` : 'Ouvir junto'}</strong><small>${escapeHtml(state.jamStatus || 'Crie uma sala ou entre com um codigo.')}</small></div>
      <button id="jam-player-close" type="button" title="Fechar">${icon('close')}</button>
    </div>
    ${session ? `<div class="jam-player-now">${playback?.song?.artworkUrl ? `<img src="${escapeHtml(playback.song.artworkUrl)}" alt="" />` : icon('music')}<div><strong>${escapeHtml(playback?.song?.title || 'Aguardando musica')}</strong><small>${participants.length} conectado${participants.length === 1 ? '' : 's'} · ${state.jamMode === 'host' ? 'voce controla' : 'seguindo anfitriao'}</small></div></div>` : ''}
    <form id="join-jam-form" class="jam-player-form">
      <input id="jam-code-input" value="${escapeHtml(state.jamJoinCode)}" placeholder="Codigo ou link da JAM" autocomplete="off" />
      <button class="secondary-button compact" type="submit">Entrar</button>
    </form>
    <div class="jam-player-actions">
      <button id="create-jam-button" class="primary-button compact" type="button">${icon('radio')} ${session ? 'Nova JAM' : 'Criar JAM'}</button>
      <button id="copy-jam-button" class="secondary-button compact" type="button" ${session ? '' : 'disabled'}>${icon('link')} Copiar convite</button>
      <button id="leave-jam-button" class="danger-button compact" type="button" ${session ? '' : 'disabled'}>Sair</button>
    </div>
  `;
  bindJamActions();
  $('#jam-player-close')?.addEventListener('click', () => panel.classList.add('hidden'));
  $('#jam-player-button')?.classList.toggle('active', Boolean(session));
}

function setJamSession(session, mode, status = '') {
  state.jamSession = session || null;
  state.jamMode = session ? mode : '';
  state.currentJamCode = session?.code || '';
  state.jamStatus = status;
  void syncFriendPresence(true);
  renderJamPlayerPanel();
}

async function syncHostedJamState(forceRender = false) {
  if (state.jamMode !== 'host' || !state.currentJamCode || state.jamSyncInFlight) return;
  const payload = currentJamPayload();
  if (!payload) return;

  state.jamSyncInFlight = true;
  try {
    const session = await window.nation.updateJamState(state.currentJamCode, payload);
    state.jamSession = session;
    if (forceRender) renderJamPlayerPanel();
  } catch (error) {
    if (await handleAuthenticationError(error)) return;
  } finally {
    state.jamSyncInFlight = false;
  }
}

function startHostingJam(session) {
  stopJamSync(false);
  setJamSession(session, 'host', 'JAM criada. Quem entrar vai acompanhar seu player.');
  jamHostTimer = window.setInterval(() => {
    void syncHostedJamState();
  }, JAM_SYNC_INTERVAL_MS);
  void syncHostedJamState(true);
}

async function pollFollowedJam(forceRender = false) {
  if (state.jamMode !== 'follower' || !state.currentJamCode || state.jamSyncInFlight) return;
  state.jamSyncInFlight = true;
  try {
    const session = await window.nation.getJam(state.currentJamCode);
    state.jamSession = session;
    await syncToJamSession(session);
    state.jamStatus = 'Sincronizado com o anfitriao.';
    if (forceRender) renderJamPlayerPanel();
  } catch (error) {
    state.jamStatus = error.message || 'Nao foi possivel sincronizar a JAM.';
    if (await handleAuthenticationError(error)) return;
    if (forceRender) renderJamPlayerPanel();
  } finally {
    state.jamSyncInFlight = false;
  }
}

function startFollowingJam(session) {
  stopJamSync(false);
  setJamSession(session, 'follower', 'Entrando na JAM e sincronizando...');
  jamFollowTimer = window.setInterval(() => {
    void pollFollowedJam();
  }, JAM_SYNC_INTERVAL_MS);
  void syncToJamSession(session)
    .then(() => {
      state.jamStatus = 'Sincronizado com o anfitriao.';
      renderJamPlayerPanel();
    })
    .catch(() => {});
}

function stopJamSync(leaveRemote = true) {
  window.clearInterval(jamHostTimer);
  window.clearInterval(jamFollowTimer);
  jamHostTimer = null;
  jamFollowTimer = null;
  state.jamSyncInFlight = false;
  const previousCode = state.currentJamCode;
  state.jamSession = null;
  state.jamMode = '';
  state.currentJamCode = '';
  state.jamStatus = previousCode ? 'Voce saiu da JAM.' : state.jamStatus;
  void syncFriendPresence(true);
  if (leaveRemote && previousCode) {
    void window.nation.leaveJam(previousCode).catch(() => {});
  }
}

async function createJamFromPlayer() {
  const payload = currentJamPayload();
  if (!payload) {
    showBanner('Toque uma musica antes de criar a JAM.', true);
    return;
  }
  try {
    state.jamStatus = 'Criando JAM...';
    renderJamPlayerPanel();
    const session = await window.nation.createJam(payload);
    startHostingJam(session);
    renderJamPlayerPanel();
    showBanner(`JAM criada: ${session.code}`);
  } catch (error) {
    if (await handleAuthenticationError(error)) return;
    state.jamStatus = error.message || 'Nao foi possivel criar a JAM.';
    renderJamPlayerPanel();
    showBanner(state.jamStatus, true);
  }
}

async function joinJamByCode(rawCode) {
  const code = normalizeJamCode(rawCode);
  if (!code) {
    showBanner('Informe o codigo da JAM.', true);
    return;
  }
  try {
    state.jamJoinCode = code;
    state.jamStatus = 'Entrando na JAM...';
    renderJamPlayerPanel();
    const session = await window.nation.joinJam(code);
    startFollowingJam(session);
    renderJamPlayerPanel();
  } catch (error) {
    if (await handleAuthenticationError(error)) return;
    state.jamStatus = error.message || 'Nao foi possivel entrar na JAM.';
    renderJamPlayerPanel();
    showBanner(state.jamStatus, true);
  }
}

async function copyJamInvite() {
  if (!state.jamSession) return;
  const message = `Entre na minha JAM do NationMusics: ${state.jamSession.inviteLink}\nCodigo: ${state.jamSession.code}`;
  try {
    await window.nation.copyText(message);
    showBanner('Convite da JAM copiado.');
  } catch {
    showBanner(`Codigo da JAM: ${state.jamSession.code}`);
  }
}

function bindJamActions() {
  $('#create-jam-button')?.addEventListener('click', () => {
    void createJamFromPlayer();
  });
  $('#leave-jam-button')?.addEventListener('click', () => {
    stopJamSync(true);
    renderJamPlayerPanel();
  });
  $('#join-jam-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void joinJamByCode($('#jam-code-input')?.value || '');
  });
  $('#jam-code-input')?.addEventListener('input', (event) => {
    state.jamJoinCode = event.target.value;
  });
  $('#copy-jam-button')?.addEventListener('click', () => {
    void copyJamInvite();
  });
}

function presenceOf(friend) {
  return friend?.presence || friend || {};
}

function formatLastSeen(lastSeenAt) {
  const timestamp = Number(lastSeenAt || 0);
  if (!timestamp) return 'Offline';
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 90) return 'Visto agora';
  if (elapsedSeconds < 3600) return `Visto ha ${Math.floor(elapsedSeconds / 60)} min`;
  if (elapsedSeconds < 86400) return `Visto ha ${Math.floor(elapsedSeconds / 3600)} h`;
  return `Visto em ${new Date(timestamp).toLocaleDateString('pt-BR')}`;
}

function formatLastListened(lastListenedAt) {
  const timestamp = Number(lastListenedAt || 0);
  if (!timestamp) return '';
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 90) return 'Ouviu musica agora';
  if (elapsedSeconds < 3600) return `Ouviu musica ha ${Math.floor(elapsedSeconds / 60)} min`;
  if (elapsedSeconds < 86400) return `Ouviu musica ha ${Math.floor(elapsedSeconds / 3600)} h`;
  return `Ouviu musica em ${new Date(timestamp).toLocaleDateString('pt-BR')}`;
}

function friendStatusLabel(friend) {
  const presence = presenceOf(friend);
  if (presence.activityHidden && !presence.online) return 'Privado';
  if (presence.listening) return 'Ouvindo agora';
  if (presence.online) return 'Online';
  return formatLastSeen(presence.lastSeenAt);
}

function friendRowsMarkup(friends) {
  if (!friends.length) {
    return `
      <div class="empty-state compact-empty">
        <b>Nenhum amigo ainda</b>
        <span>Busque pelo usuario e envie um convite.</span>
      </div>
    `;
  }

  const ordered = [...friends].sort((left, right) => {
    const leftPresence = presenceOf(left);
    const rightPresence = presenceOf(right);
    return Number(Boolean(rightPresence.online)) - Number(Boolean(leftPresence.online))
      || Number(Boolean(rightPresence.listening)) - Number(Boolean(leftPresence.listening))
      || String(left.username || '').localeCompare(String(right.username || ''), 'pt-BR');
  });

  return ordered.map((friend) => {
    const presence = presenceOf(friend);
    const song = presence.song || {};
    return `
      <article class="friend-row">
        <div class="friend-avatar">${escapeHtml(String(friend.username || '?').slice(0, 1).toUpperCase())}</div>
        <div class="friend-main">
          <div>
            <strong>${escapeHtml(friend.username || 'Usuario')}</strong>
            <span class="${presence.online ? 'friend-status online' : 'friend-status'}">${escapeHtml(friendStatusLabel(friend))}</span>
          </div>
          ${presence.listening && song.title ? `
            <div class="friend-song">
              ${song.artworkUrl ? `<img src="${escapeHtml(song.artworkUrl)}" alt="" />` : icon('music')}
              <span>${escapeHtml(song.title)}${song.artist ? ` - ${escapeHtml(song.artist)}` : ''}</span>
            </div>
          ` : presence.activityHidden && !presence.online ? `
            <span class="friend-jam">Atividade privada</span>
          ` : presence.lastListenedAt ? `
            <span class="friend-jam">${escapeHtml(formatLastListened(presence.lastListenedAt))}</span>
          ` : ''}
          ${presence.activeJamCode ? `<span class="friend-jam">JAM ativa: ${escapeHtml(presence.activeJamCode)}</span>` : ''}
        </div>
        <div class="friend-actions">
          ${presence.activeJamCode ? `
            <button class="icon-button primary join-friend-jam" title="Entrar na JAM" data-jam-code="${escapeHtml(presence.activeJamCode)}">
              ${icon('radio')}
            </button>
          ` : ''}
          <button class="icon-button remove-friend" title="Remover amigo" data-username="${escapeHtml(friend.username || '')}">
            ${icon('close')}
          </button>
        </div>
      </article>
    `;
  }).join('');
}

function requestsMarkup(requests) {
  const incoming = Array.isArray(requests?.incoming) ? requests.incoming : [];
  const outgoing = Array.isArray(requests?.outgoing) ? requests.outgoing : [];
  if (!incoming.length && !outgoing.length) return '';

  return `
    <div class="friends-section">
      <div class="section-heading inline-heading">
        <h2>Convites</h2>
        <span>${incoming.length} recebido(s), ${outgoing.length} enviado(s)</span>
      </div>
      <div class="friend-request-list">
        ${incoming.map((request) => `
          <article class="friend-request-row">
            <strong>${escapeHtml(request.username || 'Usuario')}</strong>
            <span>quer ser seu amigo</span>
            <div>
              <button class="primary-button compact accept-friend-request" data-request-id="${escapeHtml(request.requestId || '')}">${icon('check')} Aceitar</button>
              <button class="secondary-button compact decline-friend-request" data-request-id="${escapeHtml(request.requestId || '')}">${icon('close')} Recusar</button>
            </div>
          </article>
        `).join('')}
        ${outgoing.map((request) => `
          <article class="friend-request-row muted">
            <strong>${escapeHtml(request.username || 'Usuario')}</strong>
            <span>convite enviado</span>
          </article>
        `).join('')}
      </div>
    </div>
  `;
}

function searchResultsMarkup(results) {
  if (!state.friendSearchQuery.trim()) return '';
  if (!results.length) {
    return `
      <div class="friends-section">
        <div class="empty-state compact-empty">
          <b>Nenhum usuario encontrado</b>
          <span>Tente outro nome de usuario.</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="friends-section">
      <div class="section-heading inline-heading">
        <h2>Resultados</h2>
        <span>${results.length} usuario(s)</span>
      </div>
      <div class="friend-search-results">
        ${results.map((user) => {
          const relationship = String(user.relationship || '').toLowerCase();
          const pending = relationship.includes('pending');
          const accepted = relationship === 'accepted' || relationship === 'friends';
          return `
            <article class="friend-search-row">
              <div class="friend-avatar">${escapeHtml(String(user.username || '?').slice(0, 1).toUpperCase())}</div>
              <div>
                <strong>${escapeHtml(user.username || 'Usuario')}</strong>
                <span>${accepted ? 'Ja esta nos seus amigos' : pending ? 'Convite pendente' : 'Disponivel para convite'}</span>
              </div>
              <button class="primary-button compact send-friend-request" data-username="${escapeHtml(user.username || '')}" ${accepted || pending ? 'disabled' : ''}>
                ${icon('plus')} Adicionar
              </button>
            </article>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderFriendsPanel() {
  contentView.innerHTML = `
    <div class="friends-panel">
      <form id="friend-search-form" class="friend-search-form">
        <div>
          <h2>Adicionar amigo</h2>
          <span>Procure pelo nome de usuario para enviar convite.</span>
        </div>
        <div class="friend-search-input-row">
          <input id="friend-search-input" value="${escapeHtml(state.friendSearchQuery)}" placeholder="Nome do usuario" autocomplete="off" />
          <button class="primary-button compact" type="submit">${icon('search')} Buscar</button>
        </div>
      </form>
      ${searchResultsMarkup(state.friendSearchResults)}
      ${requestsMarkup(state.friendRequests)}
      <div class="friends-section">
        <div class="section-heading inline-heading">
          <h2>Seus amigos</h2>
          <span>${state.friends.length} amigo(s)</span>
        </div>
        <div class="friend-list">
          ${friendRowsMarkup(state.friends)}
        </div>
      </div>
    </div>
  `;
  bindFriendActions();
}

async function refreshFriendsPanel(showLoading = true) {
  state.view = 'friends';
  setPageHeader('AMIGOS', 'Quem esta online agora.');
  if (showLoading && !state.friends.length) setLoading('Carregando amigos...');

  try {
    const [friends, requests] = await Promise.all([
      window.nation.getFriends(),
      window.nation.getFriendRequests(),
    ]);
    state.friends = Array.isArray(friends) ? friends : [];
    state.friendRequests = requests || { incoming: [], outgoing: [] };
    state.friendsFetchedAt = Date.now();
    renderFriendsPanel();
  } catch (error) {
    if (await handleAuthenticationError(error)) return;
    contentView.innerHTML = `<div class="empty-state"><b>Amigos indisponiveis</b><span>${escapeHtml(error.message)}</span></div>`;
  }
}

async function renderFriends() {
  await refreshFriendsPanel(true);
}

async function searchFriends(query) {
  const trimmed = String(query || '').trim();
  state.friendSearchQuery = trimmed;
  state.friendSearchRequestId += 1;
  const requestId = state.friendSearchRequestId;
  if (!trimmed) {
    state.friendSearchResults = [];
    renderFriendsPanel();
    return;
  }

  try {
    const results = await window.nation.searchFriends(trimmed);
    if (requestId !== state.friendSearchRequestId) return;
    state.friendSearchResults = Array.isArray(results) ? results : [];
    renderFriendsPanel();
  } catch (error) {
    if (await handleAuthenticationError(error)) return;
    showBanner(error.message || 'Nao foi possivel buscar usuarios.', true);
  }
}

function bindFriendActions() {
  $('#friend-search-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void searchFriends($('#friend-search-input')?.value || '');
  });
  $('#friend-search-input')?.addEventListener('input', (event) => {
    state.friendSearchQuery = event.target.value;
  });
  document.querySelectorAll('.send-friend-request').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await window.nation.sendFriendRequest(button.dataset.username || '');
        showBanner('Convite enviado.');
        state.friendSearchResults = [];
        await refreshFriendsPanel(false);
      } catch (error) {
        if (await handleAuthenticationError(error)) return;
        showBanner(error.message || 'Nao foi possivel enviar convite.', true);
      }
    });
  });
  document.querySelectorAll('.accept-friend-request').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await window.nation.acceptFriendRequest(button.dataset.requestId);
        showBanner('Convite aceito.');
        await refreshFriendsPanel(false);
      } catch (error) {
        if (await handleAuthenticationError(error)) return;
        showBanner(error.message || 'Nao foi possivel aceitar convite.', true);
      }
    });
  });
  document.querySelectorAll('.decline-friend-request').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await window.nation.declineFriendRequest(button.dataset.requestId);
        showBanner('Convite recusado.');
        await refreshFriendsPanel(false);
      } catch (error) {
        if (await handleAuthenticationError(error)) return;
        showBanner(error.message || 'Nao foi possivel recusar convite.', true);
      }
    });
  });
  document.querySelectorAll('.remove-friend').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm(`Remover ${button.dataset.username} dos amigos?`)) return;
      try {
        await window.nation.removeFriend(button.dataset.username || '');
        showBanner('Amigo removido.');
        await refreshFriendsPanel(false);
      } catch (error) {
        if (await handleAuthenticationError(error)) return;
        showBanner(error.message || 'Nao foi possivel remover amigo.', true);
      }
    });
  });
  document.querySelectorAll('.join-friend-jam').forEach((button) => {
    button.addEventListener('click', () => {
      void joinJamByCode(button.dataset.jamCode || '');
    });
  });
}

function sortSongsAlphabetically(songs) {
  return [...songs].sort((left, right) =>
    String(left.title || '').localeCompare(String(right.title || ''), 'pt-BR', {
      sensitivity: 'base',
      numeric: true,
    })
    || String(left.artist || '').localeCompare(String(right.artist || ''), 'pt-BR', {
      sensitivity: 'base',
      numeric: true,
    })
    || String(left.sourceId || left.id || '').localeCompare(
      String(right.sourceId || right.id || ''),
      'pt-BR',
      { sensitivity: 'base', numeric: true }
    )
  );
}

function isSpotifyUrl(value) {
  return /(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(?:playlist|album|track)\/|spotify:(?:playlist|album|track):)[A-Za-z0-9]{22}/i
    .test(String(value || '').trim());
}

function spotifySourceLabel(type) {
  if (type === 'track') return 'Música do Spotify';
  if (type === 'album') return 'Álbum do Spotify';
  return 'Playlist do Spotify';
}

function spotifyRowsToSongs(rows, fallbackArtworkUrl = '') {
  return rows.map((track) => ({
    id: `spotify-${track.spotifyId}`,
    sourceId: '',
    title: track.title,
    artist: track.artist,
    artworkUrl: fallbackArtworkUrl,
    spotifyId: track.spotifyId,
    durationMs: track.durationMs,
    saved: false,
  }));
}

function spotifyQuery(track) {
  return `${track.title || ''} ${track.artist || ''} áudio oficial`.trim();
}

async function resolvePlayableSong(song) {
  if (!song) throw new Error('Música inválida.');
  if (song.sourceId) return song;

  const query = spotifyQuery(song);
  if (!query) throw new Error('Não foi possível localizar esta música.');

  const results = await window.nation.search(query);
  const match = Array.isArray(results) ? results.find((item) => item?.sourceId) : null;
  if (!match?.sourceId) {
    throw new Error(`Não encontrei uma fonte para "${song.title}".`);
  }

  Object.assign(song, {
    id: song.id || match.id || match.sourceId,
    sourceId: match.sourceId,
    title: song.title || match.title,
    artist: song.artist || match.artist,
    artworkUrl: match.artworkUrl || song.artworkUrl || '',
    resolvedFromSpotify: true,
  });
  return song;
}

function setLoading(message = 'Carregando...') {
  contentView.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function coverMarkup(song, className = 'song-cover') {
  return `
    <div class="${className}">
      ${song.artworkUrl
        ? `<img src="${escapeHtml(song.artworkUrl)}" alt="" />`
        : icon('music')}
    </div>
  `;
}

function songRows(songs, emptyText = 'Nada por aqui ainda.', options = {}) {
  const orderedSongs = sortSongsAlphabetically(songs);
  state.visibleSongs = orderedSongs;
  if (!orderedSongs.length) {
    return `
      <div class="empty-state">
        <b>${escapeHtml(emptyText)}</b>
        <span>Use a busca para encontrar músicas e salvá-las na sua conta.</span>
      </div>
    `;
  }

  return `
    <div class="song-list">
      ${orderedSongs.map((song, index) => {
        const identity = songIdentity(song);
        const preparing = state.preparingSourceId === identity;
        const active = songIdentity(state.queue[state.queueIndex]) === identity;
        return `
          <article class="song-row${active ? ' active' : ''}" data-song-index="${index}" data-source-id="${escapeHtml(identity)}">
            ${coverMarkup(song)}
            <div class="song-main">
              <strong>${escapeHtml(song.title)}</strong>
              <span>${song.downloaded ? 'Baixada neste PC' : song.saved ? 'Salva na sua conta' : 'Streaming online'}</span>
              ${preparing ? '<div class="progress-line"><i style="width:55%"></i></div>' : ''}
            </div>
            <div class="song-artist">${escapeHtml(song.artist)}</div>
            <div class="song-actions">
              <button class="icon-button primary play-song" title="Reproduzir online" data-index="${index}">
                ${preparing ? '<span class="mini-loader"></span>' : icon('play')}
              </button>
              ${song.saved
                ? `<button class="icon-button add-to-playlist" title="Adicionar a playlist" data-index="${index}">${icon('playlist')}</button>
                   ${options.removalMode === 'personal'
                     ? `<button class="icon-button remove-playlist-song" title="Remover desta playlist" data-index="${index}">${icon('close')}</button>`
                     : `<button class="icon-button remove-song" title="Remover de Minhas Musicas" data-index="${index}">${icon('close')}</button>`}`
                : `<button class="icon-button save-song" title="Salvar na conta" data-index="${index}">${icon('plus')}</button>`}
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function queueControlsMarkup(count, label = 'Tocar lista', allowDownload = true) {
  return `
    <div class="queue-controls" aria-label="${escapeHtml(label)}">
      <button class="queue-play-button" type="button" ${count ? '' : 'disabled'} title="Reproduzir">
        ${icon('play')}
      </button>
      <button class="queue-shuffle-toggle${state.shuffle ? ' active' : ''}" data-shuffle-toggle type="button" aria-pressed="${state.shuffle}" title="${state.shuffle ? 'Aleatório ativado' : 'Aleatório'}">
        ${icon('shuffle')}
        <span data-shuffle-label>${state.shuffle ? 'Aleatório ligado' : 'Aleatório'}</span>
      </button>
      ${allowDownload ? `<button class="queue-save-button" type="button" ${count ? '' : 'disabled'} title="Baixar músicas neste PC">${icon('download')}<span>Baixar</span></button>` : ''}
    </div>
  `;
}

function bindQueueControls(songs = state.visibleSongs) {
  document.querySelectorAll('.queue-play-button').forEach((button) => {
    button.addEventListener('click', () => {
      if (!songs.length) return;
      const index = state.shuffle ? Math.floor(Math.random() * songs.length) : 0;
      playQueue(songs, index);
    });
  });

  document.querySelectorAll('[data-shuffle-toggle]').forEach((button) => {
    button.addEventListener('click', () => toggleShuffleMode());
  });

  document.querySelectorAll('.queue-save-button').forEach((button) => {
    button.addEventListener('click', async () => {
      const pending = songs.filter((song) => !song.downloaded);
      if (!pending.length) {
        showBanner('Todas as músicas desta playlist já estão baixadas neste PC.');
        return;
      }
      button.disabled = true;
      let saved = 0;
      for (const song of pending) {
        try {
          await window.nation.downloadSong(song);
          Object.assign(song, { downloaded: true });
          saved += 1;
          button.querySelector('span').textContent = `${saved}/${pending.length}`;
        } catch (error) {
          if (await handleAuthenticationError(error)) return;
        }
      }
      showBanner(`${saved} música(s) baixadas neste PC.`);
      button.disabled = false;
      button.querySelector('span').textContent = 'Baixar';
      syncSongRows();
    });
  });

  updateShuffleButton();
}

function bindSongActions(playlist = null) {
  document.querySelectorAll('.play-song').forEach((button) => {
    button.addEventListener('click', () => playQueue(state.visibleSongs, Number(button.dataset.index)));
  });
  document.querySelectorAll('.save-song').forEach((button) => {
    button.addEventListener('click', () => saveSong(state.visibleSongs[Number(button.dataset.index)]));
  });
  document.querySelectorAll('.remove-song').forEach((button) => {
    button.addEventListener('click', async () => {
      const song = state.visibleSongs[Number(button.dataset.index)];
      try {
        await window.nation.removeFromLibrary(song.serverId);
        showBanner('Música removida da sua biblioteca.');
        if (playlist?.library) {
          const remaining = state.visibleSongs.filter((candidate) => songIdentity(candidate) !== songIdentity(song));
          playlistDetailsCache.delete(playlistDetailsCacheKey(playlist));
          renderPlaylistSongsContent(playlist, remaining);
        } else {
          await renderLibrary();
        }
      } catch (error) {
        if (await handleAuthenticationError(error)) return;
        showBanner(error.message, true);
      }
    });
  });
  document.querySelectorAll('.add-to-playlist').forEach((button) => {
    button.addEventListener('click', () => addSongToPlaylist(state.visibleSongs[Number(button.dataset.index)]));
  });
  document.querySelectorAll('.remove-playlist-song').forEach((button) => {
    button.addEventListener('click', async () => {
      const song = state.visibleSongs[Number(button.dataset.index)];
      if (!playlist?.personal || !song) return;
      if (!confirm(`Remover "${song.title}" desta playlist?`)) return;
      try {
        await window.nation.removeSongFromPersonalPlaylist(playlist.id, song.serverId || song.id);
        const remaining = state.visibleSongs.filter((candidate) => songIdentity(candidate) !== songIdentity(song));
        playlistDetailsCache.delete(playlistDetailsCacheKey(playlist));
        showBanner('Musica removida da playlist.');
        renderPlaylistSongsContent(playlist, remaining);
      } catch (error) {
        if (await handleAuthenticationError(error)) return;
        showBanner(error.message || 'Nao foi possivel remover a musica.', true);
      }
    });
  });
  syncSongRows();
}

function syncSongRows() {
  const activeSourceId = songIdentity(state.queue[state.queueIndex]);
  document.querySelectorAll('.song-row').forEach((row) => {
    const sourceId = row.dataset.sourceId || '';
    const visibleSong = state.visibleSongs[Number(row.dataset.songIndex)];
    const preparing = sourceId === state.preparingSourceId;
    row.classList.toggle('active', Boolean(activeSourceId) && sourceId === activeSourceId);

    const playButton = row.querySelector('.play-song');
    if (playButton) playButton.innerHTML = preparing ? '<span class="mini-loader"></span>' : icon('play');

    const songMain = row.querySelector('.song-main');
    const statusText = songMain?.querySelector('span');
    if (statusText && visibleSong) {
      statusText.textContent = visibleSong.downloaded
        ? 'Baixada neste PC'
        : visibleSong.saved ? 'Salva na sua conta' : 'Streaming online';
    }
    let progress = row.querySelector('.progress-line');
    if (preparing && songMain && !progress) {
      progress = document.createElement('div');
      progress.className = 'progress-line';
      progress.innerHTML = '<i style="width:55%"></i>';
      songMain.appendChild(progress);
    } else if (!preparing && progress) {
      progress.remove();
    }
  });
}

function renderHomeContent(playlists = state.playlists) {
  const featured = playlists[0];
  const quick = playlists.slice(0, 6);
  const shelf = playlists;
  contentView.innerHTML = `
    ${featured ? `<section class="home-hero" data-home-index="0">
      <div class="home-hero-art">${featured.iconUrl ? `<img src="${escapeHtml(featured.iconUrl)}" alt="" />` : icon('music')}</div>
      <div class="home-hero-copy"><span>DESTAQUE DO NATIONMUSICS</span><h2>${escapeHtml(featured.name)}</h2><p>${escapeHtml(featured.description || 'Uma seleção pronta para tocar.')}</p><button class="home-hero-play" type="button">${icon('play')} Ouvir agora</button></div>
    </section>` : ''}
    <section class="home-section">
      <div class="section-heading"><h2>Acesso rápido</h2><span>${playlists.length} coleções</span></div>
      <div class="home-quick-grid">
        ${quick.map((playlist, index) => `<button class="home-quick-card" data-home-index="${index}" type="button"><span>${playlist.iconUrl ? `<img src="${escapeHtml(playlist.iconUrl)}" alt="" />` : icon('playlist')}</span><strong>${escapeHtml(playlist.name)}</strong><i>${icon('play')}</i></button>`).join('')}
      </div>
    </section>
    <section class="home-section">
      <div class="section-heading"><h2>Explore por gênero</h2><span>Encontre seu ritmo</span></div>
      ${genreGridMarkup()}
    </section>
    <section class="home-section">
      <div class="section-heading"><h2>Feito para o seu momento</h2><span>Atualizado recentemente</span></div>
      <div class="home-shelf">
        ${shelf.map((playlist, index) => `<article class="home-album-card" data-home-index="${index}"><div>${playlist.iconUrl ? `<img src="${escapeHtml(playlist.iconUrl)}" alt="" />` : icon('playlist')}<button type="button">${icon('play')}</button></div><strong>${escapeHtml(playlist.name)}</strong><p>${escapeHtml(playlist.description || 'Playlist do NationMusics')}</p></article>`).join('')}
      </div>
    </section>
  `;
  document.querySelectorAll('[data-home-index]').forEach((card) => {
    card.addEventListener('click', () => openPlaylist(playlists[Number(card.dataset.homeIndex)]));
  });
  bindGenreActions();
}

async function renderHome(force = false) {
  state.view = 'home';
  setPageHeader('BEM-VINDO DE VOLTA', 'Sua música, do seu jeito.');
  const cacheIsFresh = state.playlists.length
    && Date.now() - state.playlistsFetchedAt < VIEW_CACHE_TTL_MS;
  if (!force && cacheIsFresh) {
    renderHomeContent();
    return;
  }

  if (state.playlists.length) renderHomeContent();
  else setLoading('Carregando playlists...');
  try {
    state.playlists = await window.nation.getPlaylists();
    state.playlistsFetchedAt = Date.now();
    renderHomeContent();
  } catch (error) {
    if (await handleAuthenticationError(error)) return;
    if (state.playlists.length) {
      showBanner(error.message, true);
      return;
    }
    contentView.innerHTML = `<div class="empty-state"><b>Não foi possível carregar</b><span>${escapeHtml(error.message)}</span></div>`;
  }
}

function playlistDetailsCacheKey(playlist) {
  return `${playlist.library ? 'library' : playlist.personal ? 'personal' : 'global'}:${playlist.id}`;
}

function renderPlaylistSongsContent(playlist, songs) {
  contentView.innerHTML = `
    <div class="playlist-detail-hero${playlist.personal ? ' personal' : ''}">
      <div class="playlist-detail-cover ${playlist.library ? 'library-gradient' : ''}">
        ${playlist.iconUrl ? `<img src="${escapeHtml(playlist.iconUrl)}" alt="" />` : icon(playlist.library ? 'music' : 'playlist')}
      </div>
      <div class="playlist-detail-copy">
        <span>${playlist.library ? 'BIBLIOTECA' : playlist.personal ? 'SUA PLAYLIST' : 'PLAYLIST'}</span>
        <h2>${escapeHtml(playlist.name)}</h2>
        <p>${escapeHtml(playlist.description || (playlist.library ? 'Todas as músicas salvas na sua conta.' : 'Uma seleção para ouvir agora.'))}</p>
        <small>${songs.length} ${songs.length === 1 ? 'música' : 'músicas'}</small>
      </div>
      <div class="playlist-detail-tools">
        ${playlist.personal ? `<div class="playlist-edit-actions"><button id="edit-personal-playlist" class="secondary-button compact" type="button">Editar detalhes</button><button id="delete-personal-playlist" class="danger-button compact" type="button">Excluir playlist</button></div>` : ''}
        ${queueControlsMarkup(songs.length, 'Tocar playlist')}
      </div>
    </div>
    ${songRows(songs, 'Esta playlist esta vazia.', { removalMode: playlist.personal ? 'personal' : playlist.library ? 'library' : '' })}
  `;
  bindSongActions(playlist);
  bindQueueControls(state.visibleSongs);
  $('#edit-personal-playlist')?.addEventListener('click', () => editPersonalPlaylist(playlist, songs));
  $('#delete-personal-playlist')?.addEventListener('click', () => deletePersonalPlaylist(playlist));
}

async function editPersonalPlaylist(playlist, songs) {
  const name = prompt('Nome da playlist', playlist.name || '');
  if (!name?.trim()) return;
  const description = prompt('Descricao', playlist.description || '');
  if (description === null) return;
  const iconUrl = prompt('URL da capa (opcional)', playlist.iconUrl || '');
  if (iconUrl === null) return;
  try {
    const updated = await window.nation.updatePersonalPlaylist(playlist.id, { name: name.trim(), description: description.trim(), iconUrl: iconUrl.trim() });
    Object.assign(playlist, updated || {}, { name: name.trim(), description: description.trim(), iconUrl: iconUrl.trim() });
    state.personalPlaylistsFetchedAt = 0;
    playlistDetailsCache.delete(playlistDetailsCacheKey(playlist));
    renderPlaylistSongsContent(playlist, songs);
    showBanner('Playlist atualizada.');
  } catch (error) {
    if (await handleAuthenticationError(error)) return;
    showBanner(error.message || 'Nao foi possivel editar a playlist.', true);
  }
}

async function deletePersonalPlaylist(playlist) {
  if (!confirm(`Excluir a playlist "${playlist.name}"? As musicas continuam em Minhas Musicas.`)) return;
  try {
    await window.nation.deletePersonalPlaylist(playlist.id);
    state.personalPlaylists = state.personalPlaylists.filter((item) => String(item.id) !== String(playlist.id));
    state.personalPlaylistsFetchedAt = 0;
    playlistDetailsCache.delete(playlistDetailsCacheKey(playlist));
    showBanner('Playlist excluida.');
    await renderLibrary();
  } catch (error) {
    if (await handleAuthenticationError(error)) return;
    showBanner(error.message || 'Nao foi possivel excluir a playlist.', true);
  }
}

async function openPlaylist(playlist) {
  state.view = playlist.library ? 'library-detail' : 'playlist-detail';
  setPageHeader(playlist.library ? 'BIBLIOTECA' : 'PLAYLIST', playlist.name);
  const cacheKey = playlistDetailsCacheKey(playlist);
  const cached = playlistDetailsCache.get(cacheKey);
  const cacheIsFresh = cached && Date.now() - cached.savedAt < VIEW_CACHE_TTL_MS;

  if (cacheIsFresh) {
    renderPlaylistSongsContent(playlist, cached.songs);
    return;
  }

  if (cached) renderPlaylistSongsContent(playlist, cached.songs);
  else setLoading('Abrindo playlist...');
  try {
    const library = await window.nation.getLibrary();
    const songs = playlist.library
      ? library
      : await (playlist.personal ? window.nation.getPersonalPlaylistSongs(playlist.id) : window.nation.getPlaylistSongs(playlist.id));
    const savedBySource = new Map(library.map((song) => [song.sourceId, song]));
    const merged = songs.map((song) => savedBySource.has(song.sourceId)
      ? { ...song, ...savedBySource.get(song.sourceId), saved: true }
      : song);
    await Promise.all(merged.map(async (song) => {
      song.downloaded = await window.nation.isSongDownloaded(song);
    }));
    playlistDetailsCache.set(cacheKey, { savedAt: Date.now(), songs: merged });
    renderPlaylistSongsContent(playlist, merged);
  } catch (error) {
    if (await handleAuthenticationError(error)) return;
    showBanner(error.message, true);
    if (cached) return;
    renderHome();
  }
}

function renderPersonalPlaylistsContent(playlists = state.personalPlaylists) {
  contentView.innerHTML = `
    <div class="section-heading">
      <h2>Playlists pessoais</h2>
      <button class="primary-button compact" id="create-personal-playlist">Nova playlist</button>
    </div>
    <div class="playlist-grid">
      ${playlists.map((playlist, index) => `
        <article class="playlist-card" data-personal-playlist-index="${index}">
          <div class="playlist-cover">
            ${playlist.iconUrl ? `<img src="${escapeHtml(playlist.iconUrl)}" alt="" />` : icon('playlist')}
          </div>
          <h3>${escapeHtml(playlist.name)}</h3>
          <p>${escapeHtml(playlist.description || 'Sua selecao pessoal.')}</p>
        </article>
      `).join('')}
    </div>
    ${playlists.length ? '' : '<div class="empty-state"><b>Nenhuma playlist ainda</b><span>Clique em Nova playlist e comece pela sua biblioteca.</span></div>'}
  `;
  $('#create-personal-playlist')?.addEventListener('click', createPersonalPlaylist);
  document.querySelectorAll('.playlist-card[data-personal-playlist-index]').forEach((card) => {
    card.addEventListener('click', () => openPlaylist({ ...playlists[Number(card.dataset.personalPlaylistIndex)], personal: true }));
  });
}

async function renderPersonalPlaylists(force = false) {
  state.view = 'personal-playlists';
  setPageHeader('SUAS PLAYLISTS', 'Crie coleções do seu jeito.');
  const cacheIsFresh = state.personalPlaylists.length
    && Date.now() - state.personalPlaylistsFetchedAt < VIEW_CACHE_TTL_MS;
  if (!force && cacheIsFresh) {
    renderPersonalPlaylistsContent();
    return;
  }

  if (state.personalPlaylists.length) renderPersonalPlaylistsContent();
  else setLoading('Carregando suas playlists...');
  try {
    const playlists = await window.nation.getPersonalPlaylists();
    state.personalPlaylists = playlists;
    state.personalPlaylistsFetchedAt = Date.now();
    contentView.innerHTML = `
      <div class="section-heading">
        <h2>Playlists pessoais</h2>
        <button class="primary-button compact" id="create-personal-playlist">Nova playlist</button>
      </div>
      <div class="playlist-grid">
        ${playlists.map((playlist, index) => `
          <article class="playlist-card" data-personal-playlist-index="${index}">
            <div class="playlist-cover">
              ${playlist.iconUrl ? `<img src="${escapeHtml(playlist.iconUrl)}" alt="" />` : icon('playlist')}
            </div>
            <h3>${escapeHtml(playlist.name)}</h3>
            <p>${escapeHtml(playlist.description || 'Sua seleção pessoal.')}</p>
          </article>
        `).join('')}
      </div>
      ${playlists.length ? '' : '<div class="empty-state"><b>Nenhuma playlist ainda</b><span>Clique em Nova playlist e comece pela sua biblioteca.</span></div>'}
    `;
    $('#create-personal-playlist')?.addEventListener('click', createPersonalPlaylist);
    document.querySelectorAll('.playlist-card[data-personal-playlist-index]').forEach((card) => {
      card.addEventListener('click', () => openPlaylist({ ...playlists[Number(card.dataset.personalPlaylistIndex)], personal: true }));
    });
  } catch (error) {
    if (await handleAuthenticationError(error)) return;
    if (state.personalPlaylists.length) {
      showBanner(error.message, true);
      return;
    }
    contentView.innerHTML = `<div class="empty-state"><b>Não foi possível carregar</b><span>${escapeHtml(error.message)}</span></div>`;
  }
}

async function createPersonalPlaylist() {
  const name = prompt('Nome da playlist');
  if (!name?.trim()) return;
  const iconUrl = prompt('URL da capa (opcional)') || '';
  try {
    await window.nation.createPersonalPlaylist({ name: name.trim(), iconUrl: iconUrl.trim() });
    showBanner('Playlist criada.');
    await renderLibrary();
  } catch (error) {
    if (await handleAuthenticationError(error)) return;
    showBanner(error.message, true);
  }
}

async function addSongToPlaylist(song) {
  try {
    const playlists = await window.nation.getPersonalPlaylists();
    if (!playlists.length) {
      showBanner('Crie uma playlist pessoal primeiro.', true);
      return;
    }
    const names = playlists.map((playlist, index) => `${index + 1}. ${playlist.name}`).join('\n');
    const choice = Number(prompt(`Adicionar em qual playlist?\n${names}`));
    const playlist = playlists[choice - 1];
    if (!playlist) return;
    await window.nation.addSongToPersonalPlaylist(playlist.id, song.serverId || song.id);
    showBanner(`Música adicionada em "${playlist.name}".`);
  } catch (error) {
    if (await handleAuthenticationError(error)) return;
    showBanner(error.message, true);
  }
}

async function renderSearch(query = '') {
  state.view = 'search';
  const requestId = state.searchRequestId + 1;
  state.searchRequestId = requestId;
  setPageHeader('ENCONTRE ALGO NOVO', query ? `Resultados para “${query}”` : 'O que vai ouvir hoje?');
  if (!query.trim()) {
    contentView.innerHTML = `
      <section class="home-section search-genres">
        <div class="section-heading"><h2>Navegue por gênero</h2><span>Escolha um estilo para começar</span></div>
        ${genreGridMarkup()}
      </section>
      <div class="empty-state"><b>Busque uma música, artista ou playlist</b><span>Ouça imediatamente e salve suas favoritas na conta.</span></div>
    `;
    bindGenreActions();
    return;
  }
  setLoading('Buscando músicas...');
  try {
    const [songs, library, playlists] = await Promise.all([
      window.nation.search(query.trim()),
      window.nation.getLibrary(),
      state.playlists.length ? Promise.resolve(state.playlists) : window.nation.getPlaylists(),
    ]);
    if (requestId !== state.searchRequestId) return;
    const savedBySource = new Map(library.map((song) => [song.sourceId, song]));
    const merged = songs.map((song) => savedBySource.has(song.sourceId)
      ? { ...song, ...savedBySource.get(song.sourceId), saved: true }
      : song);
    state.playlists = playlists;
    state.playlistsFetchedAt = Date.now();
    const normalizedQuery = normalizeCatalogText(query.trim());
    const matchingPlaylists = playlists.filter((playlist) => normalizeCatalogText(`${playlist.name} ${playlist.description || ''}`).includes(normalizedQuery));
    contentView.innerHTML = `
      <section class="home-section search-genres">
        <div class="section-heading"><h2>Gêneros</h2><span>Explore outros estilos</span></div>
        ${genreGridMarkup()}
      </section>
      ${matchingPlaylists.length ? `<section class="home-section"><div class="section-heading"><h2>Playlists</h2><span>${matchingPlaylists.length} encontradas</span></div><div class="home-shelf search-playlist-grid">${matchingPlaylists.map((playlist, index) => `<article class="home-album-card" data-search-playlist-index="${index}"><div>${playlist.iconUrl ? `<img src="${escapeHtml(playlist.iconUrl)}" alt="" />` : icon('playlist')}<button type="button">${icon('play')}</button></div><strong>${escapeHtml(playlist.name)}</strong><p>${escapeHtml(playlist.description || 'Playlist do NationMusics')}</p></article>`).join('')}</div></section>` : ''}
      <div class="section-heading">
        <h2>Músicas</h2>
        <span>${merged.length} encontrados</span>
      </div>
      ${songRows(merged, `Nenhum resultado para “${query}”.`)}
    `;
    bindGenreActions();
    document.querySelectorAll('[data-search-playlist-index]').forEach((card) => {
      card.addEventListener('click', () => openPlaylist(matchingPlaylists[Number(card.dataset.searchPlaylistIndex)]));
    });
    bindSongActions();
  } catch (error) {
    if (requestId !== state.searchRequestId) return;
    if (await handleAuthenticationError(error)) return;
    contentView.innerHTML = `<div class="empty-state"><b>Erro na busca</b><span>${escapeHtml(error.message)}</span></div>`;
  }
}

function scheduleLiveSearch(query) {
  window.clearTimeout(liveSearchTimer);
  liveSearchTimer = window.setTimeout(() => {
    activateNavigation('search');
    void renderSearch(query);
  }, SEARCH_DEBOUNCE_MS);
}

function renderSpotifyImport(initialUrl = state.spotifyUrl) {
  state.view = 'spotify';
  const preview = state.spotifyPreview;
  const tracks = Array.isArray(preview?.tracks) ? preview.tracks : [];
  const songs = preview ? spotifyRowsToSongs(tracks, preview.coverUrl || '') : [];

  setPageHeader('SPOTIFY', preview ? preview.name : 'Importar link do Spotify');
  contentView.innerHTML = `
    <div class="spotify-panel">
      <form id="spotify-form" class="spotify-form">
        <div>
          <p>${icon('spotify')} Spotify</p>
          <h2>Cole um link de música, álbum ou playlist</h2>
          <span>O app lê a lista do Spotify e toca usando a fonte disponível no servidor.</span>
        </div>
        <div class="spotify-input-row">
          <input id="spotify-url" value="${escapeHtml(initialUrl || '')}" placeholder="https://open.spotify.com/playlist/..." autocomplete="off" />
          <button id="spotify-preview-button" class="primary-button" type="submit">${icon('link')} Ler link</button>
        </div>
      </form>

      ${preview ? `
        <article class="spotify-preview-card">
          <div class="spotify-cover">
            ${preview.coverUrl ? `<img src="${escapeHtml(preview.coverUrl)}" alt="" />` : icon('spotify')}
          </div>
          <div class="spotify-preview-main">
            <span>${escapeHtml(spotifySourceLabel(preview.type))}</span>
            <h2>${escapeHtml(preview.name)}</h2>
            <p>${tracks.length} de ${Number(preview.totalTracks || tracks.length)} músicas${preview.truncated ? ' • prévia limitada' : ''}</p>
            <div class="spotify-actions">
              <button id="spotify-play-all" class="spotify-play-button" type="button" title="Reproduzir">${icon('play')}</button>
              <button id="spotify-shuffle-all" class="spotify-mode-button${state.shuffle ? ' active' : ''}" data-shuffle-toggle type="button" aria-pressed="${state.shuffle}" title="Alternar aleatório">
                ${icon('shuffle')}
                <span data-shuffle-label>${state.shuffle ? 'Aleatório ligado' : 'Aleatório'}</span>
              </button>
              <button id="spotify-save-all" class="secondary-button compact" type="button">${icon('download')} Salvar tudo</button>
            </div>
          </div>
        </article>
        <div class="section-heading spotify-track-heading">
          <h2>Faixas encontradas</h2>
          <span>${songs.length} músicas</span>
        </div>
        ${songRows(songs, 'Este link não retornou faixas.')}
      ` : `
        <div class="spotify-empty">
          ${icon('link')}
          <b>Links aceitos</b>
          <span>Música, álbum e playlist do Spotify. Você também pode colar o link direto na busca do topo.</span>
        </div>
      `}
    </div>
  `;

  $('#spotify-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void loadSpotifyPreview($('#spotify-url').value);
  });

  if (preview) {
    bindSongActions();
    $('#spotify-play-all')?.addEventListener('click', () => {
      if (!state.visibleSongs.length) return;
      const index = state.shuffle ? Math.floor(Math.random() * state.visibleSongs.length) : 0;
      playQueue(state.visibleSongs, index);
    });
    $('#spotify-shuffle-all')?.addEventListener('click', () => {
      toggleShuffleMode(false);
      renderSpotifyImport(state.spotifyUrl);
    });
    $('#spotify-save-all')?.addEventListener('click', () => {
      void saveSpotifyVisibleSongs();
    });
  }
}

async function loadSpotifyPreview(url) {
  const trimmed = String(url || '').trim();
  if (!isSpotifyUrl(trimmed)) {
    showBanner('Cole um link válido de música, álbum ou playlist do Spotify.', true);
    return;
  }

  state.spotifyUrl = trimmed;
  state.spotifyPreview = null;
  setPageHeader('SPOTIFY', 'Lendo link do Spotify...');
  setLoading('Carregando faixas do Spotify...');

  try {
    state.spotifyPreview = await window.nation.previewSpotify(trimmed);
    renderSpotifyImport(trimmed);
  } catch (error) {
    if (await handleAuthenticationError(error)) return;
    renderSpotifyImport(trimmed);
    showBanner(error.message || 'Não foi possível ler este link do Spotify.', true);
  }
}

async function saveSpotifyVisibleSongs() {
  const songs = [...state.visibleSongs];
  if (!songs.length) return;

  const button = $('#spotify-save-all');
  if (button) {
    button.disabled = true;
    button.innerHTML = `${icon('download')} Salvando 0/${songs.length}`;
  }

  let savedCount = 0;
  for (const song of songs) {
    try {
      const playable = await resolvePlayableSong(song);
      const saved = await window.nation.saveToLibrary(playable);
      Object.assign(song, saved || {}, { saved: true });
      savedCount += 1;
      if (button) button.innerHTML = `${icon('download')} Salvando ${savedCount}/${songs.length}`;
    } catch (error) {
      if (await handleAuthenticationError(error)) return;
      console.warn('Falha ao salvar música do Spotify:', error);
    }
  }

  showBanner(`${savedCount} música(s) salvas na sua biblioteca.`);
  renderSpotifyImport(state.spotifyUrl);
}

async function renderLibrary() {
  state.view = 'library';
  setPageHeader('SUA COLEÇÃO', 'Biblioteca');
  setLoading('Carregando biblioteca...');
  try {
    const [library, playlists] = await Promise.all([
      window.nation.getLibrary(),
      window.nation.getPersonalPlaylists(),
    ]);
    state.library = library;
    state.personalPlaylists = playlists;
    state.personalPlaylistsFetchedAt = Date.now();
    contentView.innerHTML = `
      <article class="library-feature" id="open-saved-library">
        <div class="library-feature-cover">${icon('music')}</div>
        <div class="library-feature-copy">
          <span>NA SUA CONTA</span>
          <h2>Minhas Músicas</h2>
          <p>Todas as músicas que você salvou, reunidas em um só lugar.</p>
          <small>${library.length} ${library.length === 1 ? 'música' : 'músicas'}</small>
        </div>
        ${icon('arrow-right')}
      </article>
      <div class="section-heading library-section-heading">
        <div class="section-title-stack"><h2>Suas playlists</h2><span>${playlists.length} ${playlists.length === 1 ? 'coleção' : 'coleções'}</span></div>
        <button class="primary-button compact" id="create-personal-playlist">Nova playlist</button>
      </div>
      <div class="playlist-grid library-playlist-grid">
        ${playlists.map((playlist, index) => `
          <article class="playlist-card library-playlist-card" data-personal-playlist-index="${index}">
            <div class="playlist-cover">${playlist.iconUrl ? `<img src="${escapeHtml(playlist.iconUrl)}" alt="" />` : icon('playlist')}</div>
            <h3>${escapeHtml(playlist.name)}</h3>
            <p>${escapeHtml(playlist.description || 'Sua seleção pessoal.')}</p>
          </article>
        `).join('')}
      </div>
      ${playlists.length ? '' : '<div class="empty-state compact-empty"><b>Nenhuma playlist pessoal</b><span>Crie uma playlist para organizar suas músicas.</span></div>'}
    `;
    $('#open-saved-library')?.addEventListener('click', () => openPlaylist({ id: 'library', name: 'Minhas Músicas', library: true }));
    $('#create-personal-playlist')?.addEventListener('click', createPersonalPlaylist);
    document.querySelectorAll('.playlist-card[data-personal-playlist-index]').forEach((card) => {
      card.addEventListener('click', () => openPlaylist({ ...playlists[Number(card.dataset.personalPlaylistIndex)], personal: true }));
    });
  } catch (error) {
    if (await handleAuthenticationError(error)) return;
    contentView.innerHTML = `<div class="empty-state"><b>Biblioteca indisponível</b><span>${escapeHtml(error.message)}</span></div>`;
  }
}

function setPageHeader(eyebrow, title) {
  $('#eyebrow').textContent = eyebrow;
  $('#view-title').textContent = title;
}

async function saveSong(song) {
  try {
    const playable = await resolvePlayableSong(song);
    const saved = await window.nation.saveToLibrary(playable);
    Object.assign(song, saved || {}, { saved: true });
    showBanner('Música salva na sua conta.');
    if (state.view === 'library') await renderLibrary();
    else await refreshCurrentView();
  } catch (error) {
    if (await handleAuthenticationError(error)) return;
    showBanner(error.message, true);
  }
}

function playQueue(songs, index) {
  reportCurrentPlayback(false);
  const playable = songs.filter((song) => song.sourceId || song.spotifyId || song.title);
  const selected = songs[index];
  const selectedIdentity = songIdentity(selected);
  const actualIndex = playable.findIndex((song) => songIdentity(song) === selectedIdentity);
  if (actualIndex < 0) {
    showBanner('Esta música não possui uma fonte de reprodução.', true);
    return;
  }
  state.queue = playable;
  state.queueIndex = actualIndex;
  state.queueRevision += 1;
  state.queueMode = 'selection';
  state.recommendationContinuationInFlight = false;
  state.shuffleNextIndex = -1;
  resetShuffleRemainingIndexes();
  void (async () => {
    if (state.connectState && !state.connectState.currentDeviceActive) {
      const connect = await controlConnectPlayback('SYNC');
      if (connect) state.connectProcessedRevision = Math.max(state.connectProcessedRevision, Number(connect.commandRevision) || 0);
    }
    await loadCurrentTrack();
    window.setTimeout(prefetchNextTrack, 1000);
    void syncConnectPlayback();
  })();
}

async function continueWithDailyRecommendations() {
  if (state.queueMode !== 'selection' || state.recommendationContinuationInFlight) return;
  const revision = state.queueRevision;
  const originalQueue = [...state.queue];
  state.recommendationContinuationInFlight = true;
  try {
    const mix = await window.nation.getDailyMix();
    if (revision !== state.queueRevision || state.queueMode !== 'selection') return;
    const existing = new Set(originalQueue.map(songIdentity));
    const additions = (mix.songs || []).filter((song) => {
      const identity = songIdentity(song);
      if (!identity || existing.has(identity)) return false;
      existing.add(identity);
      return true;
    });
    if (!additions.length) {
      state.queueIndex = state.shuffle ? Math.floor(Math.random() * state.queue.length) : 0;
      resetShuffleRemainingIndexes();
      await loadCurrentTrack();
      return;
    }
    state.queue = additions;
    state.queueIndex = state.shuffle ? Math.floor(Math.random() * additions.length) : 0;
    state.queueRevision += 1;
    state.queueMode = 'recommendations';
    state.shuffleNextIndex = -1;
    state.shuffleRemainingIndexes = [];
    await loadCurrentTrack();
    window.setTimeout(prefetchNextTrack, 1000);
  } catch {
    if (revision === state.queueRevision && state.queueMode === 'selection' && state.queue.length) {
      state.queueIndex = state.shuffle ? Math.floor(Math.random() * state.queue.length) : 0;
      resetShuffleRemainingIndexes();
      await loadCurrentTrack();
    }
  } finally {
    state.recommendationContinuationInFlight = false;
  }
}

function reportCurrentPlayback(completed = false) {
  const song = state.queue[state.queueIndex];
  if (!song) return;
  void window.nation.reportPlayback({
    songId: song.serverId || song.id,
    sourceId: song.sourceId,
    listenedSeconds: Math.max(0, Math.round(audio.currentTime || 0)),
    completed,
  }).catch(() => {});
}

async function loadCurrentTrack() {
  const song = state.queue[state.queueIndex];
  if (!song) return;
  const requestId = ++state.trackLoadRequestId;
  let key = songIdentity(song);
  const alreadyPrepared = isPrepared(song);

  state.preparingSourceId = alreadyPrepared ? '' : key;
  $('#player-title').textContent = song.title;
  $('#player-artist').textContent = alreadyPrepared
    ? song.artist
    : `${song.sourceId ? 'Preparando' : 'Localizando'} • ${song.artist}`;
  $('#player-cover').innerHTML = song.artworkUrl
    ? `<img src="${escapeHtml(song.artworkUrl)}" alt="" />`
    : icon('music');
  syncSongRows();

  try {
    const resolved = await resolvePlayableSong(song);
    if (requestId !== state.trackLoadRequestId) return;
    state.queue[state.queueIndex] = resolved;
    key = songIdentity(resolved);
    state.preparingSourceId = isPrepared(resolved) ? '' : key;
    $('#player-cover').innerHTML = resolved.artworkUrl
      ? `<img src="${escapeHtml(resolved.artworkUrl)}" alt="" />`
      : icon('music');
    $('#player-artist').textContent = isPrepared(resolved) ? resolved.artist : `Preparando • ${resolved.artist}`;
    syncSongRows();

    const url = await prepareStreamCached(resolved);
    if (requestId !== state.trackLoadRequestId) return;
    state.preparingSourceId = '';
    audio.src = url;
    $('#player-artist').textContent = resolved.artist;
    await audio.play();
    await syncDiscordActivity(true);
    void syncHostedJamState(true);
    syncSongRows();
    prefetchNextTrack();
  } catch (error) {
    if (requestId !== state.trackLoadRequestId) return;
    state.preparingSourceId = '';
    $('#player-artist').textContent = song.artist;
    if (await handleAuthenticationError(error)) return;
    showBanner(error.message || 'Não foi possível reproduzir esta música.', true);
    syncSongRows();
  }
}

async function nextTrack(direction) {
  if (!state.queue.length) return;
  if (direction > 0 && state.shuffle && state.queue.length > 1) {
    const nextIndex = plannedNextQueueIndex();
    if (nextIndex < 0) {
      await continueWithDailyRecommendations();
      return;
    }
    state.queueIndex = nextIndex;
    if (state.queueMode === 'selection') {
      state.shuffleRemainingIndexes = state.shuffleRemainingIndexes.filter((index) => index !== nextIndex);
    }
    state.shuffleNextIndex = -1;
  } else if (direction > 0 && state.queueMode === 'selection' && state.queueIndex >= state.queue.length - 1) {
    await continueWithDailyRecommendations();
    return;
  } else {
    state.queueIndex = (state.queueIndex + direction + state.queue.length) % state.queue.length;
    if (direction < 0) state.shuffleNextIndex = -1;
  }
  await loadCurrentTrack();
  window.setTimeout(prefetchNextTrack, 1000);
}

async function refreshCurrentView() {
  if (state.view === 'library') await renderLibrary();
  else if (state.view === 'search') await renderSearch($('#search-input').value);
  else if (state.view === 'spotify') renderSpotifyImport(state.spotifyUrl);
  else if (state.view === 'friends') await refreshFriendsPanel(false);
}

function activateNavigation(view) {
  document.querySelectorAll('.nav-item[data-view]').forEach((item) => {
    item.classList.toggle('active', item.dataset.view === view);
  });
}

async function showApp(session) {
  state.session = session;
  authScreen.classList.add('hidden');
  appShell.classList.remove('hidden');
  $('#profile-name').textContent = session.username;
  $('#avatar').textContent = session.username.slice(0, 1).toUpperCase();
  $('#top-profile-name').textContent = session.username;
  $('#top-avatar').textContent = session.username.slice(0, 1).toUpperCase();
  startFriendPresenceHeartbeat();
  startFriendListRefresh();
  startConnectSync();
  await refreshDiscordStatus();
  await renderHome();
}

function showAuth(message = '') {
  state.session = null;
  stopJamSync(false);
  stopFriendPresenceHeartbeat(false);
  stopFriendListRefresh();
  stopConnectSync();
  appShell.classList.add('hidden');
  authScreen.classList.remove('hidden');
  $('#auth-error').textContent = message;
}

$('#auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = $('#auth-submit');
  const errorNode = $('#auth-error');
  submit.disabled = true;
  submit.textContent = state.authMode === 'login' ? 'Entrando...' : 'Criando...';
  errorNode.textContent = '';
  const credentials = {
    username: $('#username').value.trim(),
    password: $('#password').value,
  };
  try {
    const session = state.authMode === 'login'
      ? await window.nation.login(credentials)
      : await window.nation.register(credentials);
    await showApp(session);
  } catch (error) {
    errorNode.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = state.authMode === 'login' ? 'Entrar' : 'Criar conta';
  }
});

$('#auth-toggle').addEventListener('click', () => {
  state.authMode = state.authMode === 'login' ? 'register' : 'login';
  $('#auth-subtitle').textContent = state.authMode === 'login'
    ? 'Entre para acessar sua música.'
    : 'Crie sua conta e comece a ouvir.';
  $('#auth-submit').textContent = state.authMode === 'login' ? 'Entrar' : 'Criar conta';
  $('#auth-toggle').textContent = state.authMode === 'login' ? 'Criar uma conta' : 'Já tenho uma conta';
  $('#auth-error').textContent = '';
});

document.querySelectorAll('.nav-item[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    activateNavigation(button.dataset.view);
    if (button.dataset.view === 'home') renderHome();
    if (button.dataset.view === 'search') renderSearch($('#search-input').value);
    if (button.dataset.view === 'library') renderLibrary();
    if (button.dataset.view === 'friends') renderFriends();
  });
});

$('#global-search').addEventListener('submit', (event) => {
  event.preventDefault();
  window.clearTimeout(liveSearchTimer);
  const query = $('#search-input').value.trim();
  if (/nationmusics:\/\/\/jam\/|\/jam\/|^jam\s+/i.test(query)) {
    $('#jam-player-panel')?.classList.remove('hidden');
    renderJamPlayerPanel();
    void joinJamByCode(query.replace(/^jam\s+/i, ''));
    return;
  }
  activateNavigation('search');
  renderSearch(query);
});

$('#search-input').addEventListener('input', (event) => {
  scheduleLiveSearch(event.target.value.trim());
});

$('#logout-button').addEventListener('click', async () => {
  audio.pause();
  audio.removeAttribute('src');
  stopJamSync(true);
  stopFriendPresenceHeartbeat(true);
  stopConnectSync();
  await window.nation.clearDiscordActivity();
  await window.nation.logout();
  showAuth();
});
$('#top-logout-button')?.addEventListener('click', () => $('#logout-button')?.click());
$('#jam-player-button')?.addEventListener('click', () => {
  const panel = $('#jam-player-panel');
  panel?.classList.toggle('hidden');
  if (panel && !panel.classList.contains('hidden')) renderJamPlayerPanel();
});

$('#discord-button')?.addEventListener('click', () => {
  void configureDiscord();
});
$('#top-discord-button')?.addEventListener('click', () => {
  void configureDiscord();
});

$('#play-button').addEventListener('click', () => {
  if (state.connectState && !state.connectState.currentDeviceActive) {
    void controlConnectPlayback(state.connectState.playing ? 'PAUSE' : 'PLAY');
    return;
  }
  if (!audio.src) return;
  if (audio.paused) audio.play(); else audio.pause();
});
$('#shuffle-button')?.addEventListener('click', () => {
  toggleShuffleMode();
});
$('#previous-button').addEventListener('click', () => {
  if (state.connectState && !state.connectState.currentDeviceActive) { void controlConnectPlayback('PREVIOUS'); return; }
  reportCurrentPlayback(false);
  nextTrack(-1);
});
$('#next-button').addEventListener('click', () => {
  if (state.connectState && !state.connectState.currentDeviceActive) { void controlConnectPlayback('NEXT'); return; }
  reportCurrentPlayback(false);
  nextTrack(1);
});
$('#volume').addEventListener('input', (event) => {
  if (state.connectState && !state.connectState.currentDeviceActive) {
    const normalized = clamp(Number(event.target.value) || 0, 0, 100) / 100;
    void controlConnectPlayback('VOLUME', normalized ** VOLUME_CURVE);
    return;
  }
  setVolumeFromSlider(event.target.value);
});
$('#mute-button').addEventListener('click', () => {
  if (state.connectState && !state.connectState.currentDeviceActive) {
    void controlConnectPlayback('VOLUME', Number(state.connectState.volumeLevel) > 0 ? 0 : 0.7);
    return;
  }
  if (state.volumeSliderValue === 0) {
    setVolumeFromSlider(state.lastAudibleVolumeSliderValue || 70);
  } else {
    setVolumeFromSlider(0);
  }
});
$('#seek').addEventListener('input', (event) => {
  if (state.connectState && !state.connectState.currentDeviceActive) {
    const duration = Number(state.connectState.durationSeconds) || 0;
    if (duration > 0) void controlConnectPlayback('SEEK', (Number(event.target.value) / 100) * duration);
    return;
  }
  if (Number.isFinite(audio.duration)) {
    audio.currentTime = (Number(event.target.value) / 100) * audio.duration;
  }
});

$('#connect-button')?.addEventListener('click', () => {
  $('#connect-panel')?.classList.toggle('hidden');
  renderConnectState();
});
$('#connect-close')?.addEventListener('click', () => $('#connect-panel')?.classList.add('hidden'));
$('#connect-takeover')?.addEventListener('click', async () => {
  const connect = await controlConnectPlayback('SYNC');
  if (connect) {
    $('#connect-panel')?.classList.add('hidden');
    await executeConnectCommand(connect);
    void syncConnectPlayback();
  }
});

restoreSavedVolume();
audio.addEventListener('play', () => {
  setPlayButtonIcon(true);
  void syncDiscordActivity(true);
  void syncFriendPresence(true);
  void syncHostedJamState(true);
  void syncConnectPlayback();
});
audio.addEventListener('pause', () => {
  setPlayButtonIcon(false);
  void syncDiscordActivity(true);
  void syncFriendPresence(true);
  void syncHostedJamState(true);
  void syncConnectPlayback();
});
audio.addEventListener('ended', () => {
  reportCurrentPlayback(true);
  void window.nation.clearDiscordActivity();
  void syncFriendPresence(true);
  void syncHostedJamState(true);
  nextTrack(1);
});
audio.addEventListener('error', () => {
  if (audio.src) showBanner('O streaming foi interrompido. Tente novamente.', true);
  void window.nation.clearDiscordActivity();
  void syncFriendPresence(true);
});
audio.addEventListener('timeupdate', () => {
  $('#current-time').textContent = formatTime(audio.currentTime);
  $('#duration').textContent = formatTime(audio.duration);
  $('#seek').value = Number.isFinite(audio.duration) && audio.duration > 0
    ? String((audio.currentTime / audio.duration) * 100)
    : '0';
  void syncDiscordActivity();
  void syncFriendPresence();
});

window.addEventListener('beforeunload', () => {
  void window.nation.clearDiscordActivity();
  void window.nation.clearFriendPresence();
  if (state.currentJamCode) void window.nation.leaveJam(state.currentJamCode).catch(() => {});
});

window.addEventListener('DOMContentLoaded', async () => {
  renderIconSlots();
  setPlayButtonIcon(false);
  $('#player-cover').innerHTML = icon('music');
  updateShuffleButton();
  if (await enforceRequiredUpdate()) return;
  const session = await window.nation.getSession();
  if (session?.token) await showApp(session);
  else showAuth();
});
