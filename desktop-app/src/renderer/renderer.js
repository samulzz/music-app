const state = {
  session: null,
  view: 'home',
  authMode: 'login',
  playlists: [],
  library: [],
  visibleSongs: [],
  queue: [],
  queueIndex: -1,
  preparingSourceId: '',
};

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

function showBanner(message, error = false) {
  const banner = $('#status-banner');
  banner.textContent = message;
  banner.className = `status-banner${error ? ' error' : ''}`;
  clearTimeout(showBanner.timer);
  showBanner.timer = setTimeout(() => banner.classList.add('hidden'), 5000);
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
        : '<span>♫</span>'}
    </div>
  `;
}

function songRows(songs, emptyText = 'Nada por aqui ainda.') {
  state.visibleSongs = songs;
  if (!songs.length) {
    return `
      <div class="empty-state">
        <b>${escapeHtml(emptyText)}</b>
        <span>Use a busca para encontrar músicas e salvá-las na sua conta.</span>
      </div>
    `;
  }

  return `
    <div class="song-list">
      ${songs.map((song, index) => {
        const identity = song.sourceId || song.id;
        const preparing = state.preparingSourceId === identity;
        return `
          <article class="song-row" data-song-index="${index}">
            ${coverMarkup(song)}
            <div class="song-main">
              <strong>${escapeHtml(song.title)}</strong>
              <span>${song.saved ? 'Salva na sua conta' : 'Streaming online'}</span>
              ${preparing ? '<div class="progress-line"><i style="width:55%"></i></div>' : ''}
            </div>
            <div class="song-artist">${escapeHtml(song.artist)}</div>
            <div class="song-actions">
              <button class="icon-button primary play-song" title="Reproduzir online" data-index="${index}">
                ${preparing ? '…' : '▶'}
              </button>
              ${song.saved
                ? `<button class="icon-button remove-song" title="Remover da biblioteca" data-index="${index}">×</button>`
                : `<button class="icon-button save-song" title="Salvar na conta" data-index="${index}">＋</button>`}
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function bindSongActions() {
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
        await renderLibrary();
      } catch (error) {
        showBanner(error.message, true);
      }
    });
  });
}

async function renderHome() {
  state.view = 'home';
  setPageHeader('BEM-VINDO DE VOLTA', 'Sua música, do seu jeito.');
  setLoading('Carregando playlists...');
  try {
    state.playlists = await window.nation.getPlaylists();
    contentView.innerHTML = `
      <div class="section-heading">
        <h2>Feito para ouvir agora</h2>
        <span>${state.playlists.length} coleções</span>
      </div>
      <div class="playlist-grid">
        ${state.playlists.map((playlist, index) => `
          <article class="playlist-card" data-playlist-index="${index}">
            <div class="playlist-cover">
              ${playlist.iconUrl
                ? `<img src="${escapeHtml(playlist.iconUrl)}" alt="" />`
                : '<span>♫</span>'}
            </div>
            <h3>${escapeHtml(playlist.name)}</h3>
            <p>${escapeHtml(playlist.description || 'Uma seleção para você.')}</p>
          </article>
        `).join('')}
      </div>
    `;
    document.querySelectorAll('.playlist-card').forEach((card) => {
      card.addEventListener('click', () => openPlaylist(state.playlists[Number(card.dataset.playlistIndex)]));
    });
  } catch (error) {
    contentView.innerHTML = `<div class="empty-state"><b>Não foi possível carregar</b><span>${escapeHtml(error.message)}</span></div>`;
  }
}

async function openPlaylist(playlist) {
  setPageHeader('PLAYLIST', playlist.name);
  setLoading('Abrindo playlist...');
  try {
    const [songs, library] = await Promise.all([
      window.nation.getPlaylistSongs(playlist.id),
      window.nation.getLibrary(),
    ]);
    const savedBySource = new Map(library.map((song) => [song.sourceId, song]));
    const merged = songs.map((song) => savedBySource.has(song.sourceId)
      ? { ...song, ...savedBySource.get(song.sourceId), saved: true }
      : song);
    contentView.innerHTML = `
      <div class="section-heading">
        <h2>${escapeHtml(playlist.name)}</h2>
        <span>${merged.length} músicas</span>
      </div>
      ${songRows(merged, 'Esta playlist está vazia.')}
    `;
    bindSongActions();
  } catch (error) {
    showBanner(error.message, true);
    renderHome();
  }
}

async function renderSearch(query = '') {
  state.view = 'search';
  setPageHeader('ENCONTRE ALGO NOVO', query ? `Resultados para “${query}”` : 'O que vai ouvir hoje?');
  if (!query.trim()) {
    contentView.innerHTML = `
      <div class="empty-state">
        <b>Busque uma música ou artista</b>
        <span>Ouça imediatamente e salve suas favoritas na conta.</span>
      </div>
    `;
    return;
  }
  setLoading('Buscando músicas...');
  try {
    const [songs, library] = await Promise.all([
      window.nation.search(query.trim()),
      window.nation.getLibrary(),
    ]);
    const savedBySource = new Map(library.map((song) => [song.sourceId, song]));
    const merged = songs.map((song) => savedBySource.has(song.sourceId)
      ? { ...song, ...savedBySource.get(song.sourceId), saved: true }
      : song);
    contentView.innerHTML = `
      <div class="section-heading">
        <h2>Resultados</h2>
        <span>${merged.length} encontrados</span>
      </div>
      ${songRows(merged, `Nenhum resultado para “${query}”.`)}
    `;
    bindSongActions();
  } catch (error) {
    contentView.innerHTML = `<div class="empty-state"><b>Erro na busca</b><span>${escapeHtml(error.message)}</span></div>`;
  }
}

async function renderLibrary() {
  state.view = 'library';
  setPageHeader('SEMPRE NA SUA CONTA', 'Sua biblioteca.');
  setLoading('Carregando biblioteca...');
  try {
    state.library = await window.nation.getLibrary();
    contentView.innerHTML = `
      <div class="section-heading">
        <h2>Músicas salvas</h2>
        <span>${state.library.length} na sua conta</span>
      </div>
      ${songRows(state.library, 'Nenhuma música salva ainda.')}
    `;
    bindSongActions();
  } catch (error) {
    contentView.innerHTML = `<div class="empty-state"><b>Biblioteca indisponível</b><span>${escapeHtml(error.message)}</span></div>`;
  }
}

function setPageHeader(eyebrow, title) {
  $('#eyebrow').textContent = eyebrow;
  $('#view-title').textContent = title;
}

async function saveSong(song) {
  try {
    await window.nation.saveToLibrary(song);
    showBanner('Música salva na sua conta.');
    if (state.view === 'library') await renderLibrary();
    else await refreshCurrentView();
  } catch (error) {
    showBanner(error.message, true);
  }
}

function playQueue(songs, index) {
  const playable = songs.filter((song) => song.sourceId);
  const selected = songs[index];
  const actualIndex = playable.findIndex((song) => song.sourceId === selected.sourceId);
  if (actualIndex < 0) {
    showBanner('Esta música não possui uma fonte de reprodução.', true);
    return;
  }
  state.queue = playable;
  state.queueIndex = actualIndex;
  loadCurrentTrack();
}

async function loadCurrentTrack() {
  const song = state.queue[state.queueIndex];
  if (!song) return;

  state.preparingSourceId = song.sourceId;
  $('#player-title').textContent = song.title;
  $('#player-artist').textContent = `Preparando • ${song.artist}`;
  $('#player-cover').innerHTML = song.artworkUrl
    ? `<img src="${escapeHtml(song.artworkUrl)}" alt="" />`
    : '♫';
  refreshCurrentView();

  try {
    const url = await window.nation.prepareStream(song);
    state.preparingSourceId = '';
    audio.src = url;
    $('#player-artist').textContent = song.artist;
    await audio.play();
    refreshCurrentView();
  } catch (error) {
    state.preparingSourceId = '';
    $('#player-artist').textContent = song.artist;
    showBanner(error.message || 'Não foi possível reproduzir esta música.', true);
    refreshCurrentView();
  }
}

function nextTrack(direction) {
  if (!state.queue.length) return;
  state.queueIndex = (state.queueIndex + direction + state.queue.length) % state.queue.length;
  loadCurrentTrack();
}

async function refreshCurrentView() {
  if (state.view === 'library') await renderLibrary();
  else if (state.view === 'search') await renderSearch($('#search-input').value);
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
  await renderHome();
}

function showAuth() {
  state.session = null;
  appShell.classList.add('hidden');
  authScreen.classList.remove('hidden');
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
  });
});

$('#global-search').addEventListener('submit', (event) => {
  event.preventDefault();
  activateNavigation('search');
  renderSearch($('#search-input').value);
});

$('#logout-button').addEventListener('click', async () => {
  audio.pause();
  audio.removeAttribute('src');
  await window.nation.logout();
  showAuth();
});

$('#play-button').addEventListener('click', () => {
  if (!audio.src) return;
  if (audio.paused) audio.play();
  else audio.pause();
});
$('#previous-button').addEventListener('click', () => nextTrack(-1));
$('#next-button').addEventListener('click', () => nextTrack(1));
$('#volume').addEventListener('input', (event) => {
  audio.volume = Number(event.target.value);
});
$('#seek').addEventListener('input', (event) => {
  if (Number.isFinite(audio.duration)) {
    audio.currentTime = (Number(event.target.value) / 100) * audio.duration;
  }
});

audio.volume = 0.85;
audio.addEventListener('play', () => { $('#play-button').textContent = 'Ⅱ'; });
audio.addEventListener('pause', () => { $('#play-button').textContent = '▶'; });
audio.addEventListener('ended', () => nextTrack(1));
audio.addEventListener('error', () => {
  if (audio.src) showBanner('O streaming foi interrompido. Tente novamente.', true);
});
audio.addEventListener('timeupdate', () => {
  $('#current-time').textContent = formatTime(audio.currentTime);
  $('#duration').textContent = formatTime(audio.duration);
  $('#seek').value = Number.isFinite(audio.duration) && audio.duration > 0
    ? String((audio.currentTime / audio.duration) * 100)
    : '0';
});

window.addEventListener('DOMContentLoaded', async () => {
  const session = await window.nation.getSession();
  if (session?.token) await showApp(session);
  else showAuth();
});
