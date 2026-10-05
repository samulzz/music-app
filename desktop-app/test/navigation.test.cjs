const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/renderer/renderer.js'), 'utf8');

test('a late playlist response cannot overwrite navigation to home or another playlist', async () => {
  let complete;
  let renders = 0;
  const context = {
    state: { view: '', viewRequestId: 0 }, document: { querySelector: () => null },
    playlistDetailsCache: new Map(), VIEW_CACHE_TTL_MS: 300000,
    playlistDetailsCacheKey: playlist => playlist.id, setPageHeader: () => {}, setLoading: () => {},
    renderPlaylistSongsContent: () => renders++,
    window: { nation: { getLibrary: async () => [], getPersonalPlaylistSongs: () => new Promise(resolve => complete = resolve) } },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function beginView('), source.indexOf('function setLoading(')), context);
  vm.runInContext(source.slice(source.indexOf('async function openPlaylist('), source.indexOf('function renderPersonalPlaylistsContent(')), context);
  const pending = context.openPlaylist({ id: 'old', personal: true });
  context.beginView('home');
  complete([]); await pending;
  assert.equal(renders, 0);
  assert.equal(context.state.view, 'home');
});
