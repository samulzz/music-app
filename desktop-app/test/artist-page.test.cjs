const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/renderer/renderer.js'), 'utf8');

function harness(failAlbums = false) {
  const controls = [];
  const context = {
    state: { artistName: '', searchRequestId: 0 },
    beginView: () => 1, currentView: () => true, setPageHeader() {}, setLoading() {},
    contentView: { innerHTML: '', querySelectorAll: () => [] },
    document: { querySelectorAll: () => [] },
    normalizeCatalogText: value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
    escapeHtml: value => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    icon: () => '', queueControlsMarkup: () => '<controls>', songRows: () => '<songs>',
    bindQueueControls: (songs, collection) => controls.push(collection), bindSongActions() {},
    window: { nation: {
      getArtistSongs: async () => [{ sourceId: 'one', title: 'One', artworkUrl: '' }],
      getLibrary: async () => [],
      getAlbums: async () => { if (failAlbums) throw Error('offline'); return [
        { name: 'Disco <seguro>', artist: 'Alee', songCount: 3 },
        { name: 'Outro artista', artist: 'Alec', songCount: 4 },
      ]; },
    } },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('async function renderArtist('), source.indexOf('async function renderAlbum(')), context);
  return { context, controls };
}

test('artist page lists only its albums, escapes titles and uses artist playback context', async () => {
  const { context, controls } = harness();
  await context.renderArtist('Alee');
  assert.match(context.contentView.innerHTML, /Disco &lt;seguro&gt;/);
  assert.doesNotMatch(context.contentView.innerHTML, /Outro artista/);
  assert.equal(controls[0].type, 'artist');
  assert.equal(controls[0].id, 'Alee');
});

test('album outage does not prevent artist songs from opening', async () => {
  const { context } = harness(true);
  await context.renderArtist('Alee');
  assert.match(context.contentView.innerHTML, /<songs>/);
  assert.doesNotMatch(context.contentView.innerHTML, /Não foi possível/);
});
