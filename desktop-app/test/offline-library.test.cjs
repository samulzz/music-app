const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/main.cjs'), 'utf8');

function handler(name, bindings) {
  const handlers = new Map();
  const start = source.indexOf(`ipcMain.handle('${name}'`);
  const end = source.indexOf('\nipcMain.handle(', start + 1);
  const context = vm.createContext({ ...bindings, ipcMain: { handle: (key, fn) => handlers.set(key, fn) } });
  vm.runInContext(source.slice(start, end), context);
  return handlers.get(name);
}

test('valid local playback never waits for the VPS', async () => {
  let networkCalls = 0;
  const prepare = handler('music:prepare-stream', {
    normalizeSong: song => song, protectedAudio: new Map(), cachedAudioFilePath: id => id,
    hasUsableCachedAudio: async () => true, streamUrl: () => 'local-audio',
    waitUntilPrepared: async () => networkCalls++, Date,
  });
  assert.equal(await prepare(null, { sourceId: 'track' }), 'local-audio');
  assert.equal(networkCalls, 0);
});

test('explicit download pins an already cached file without fetching again', async () => {
  let pinned = '', networkCalls = 0;
  const download = handler('music:download', {
    normalizeSong: song => song, protectedAudio: new Map(), cachedAudioFilePath: id => id,
    hasUsableCachedAudio: async () => true, pinOfflineSong: async song => pinned = song.sourceId,
    waitUntilPrepared: async () => networkCalls++, ensureDesktopAudioCached: async () => networkCalls++, Date,
  });
  assert.equal(await download(null, { sourceId: 'track' }), true);
  assert.equal(pinned, 'track');
  assert.equal(networkCalls, 0);
});

test('automatic cache and another account are not presented as explicit downloads', async () => {
  const downloaded = handler('music:is-downloaded', {
    normalizeSong: song => song, getSession: async () => ({ username: 'alice' }), dataPath: value => value,
    readJson: async () => ({ alice: [{ sourceId: 'saved' }], bob: [{ sourceId: 'other' }] }),
    hasUsableCachedAudio: async () => true, cachedAudioFilePath: value => value,
  });
  assert.equal(await downloaded(null, { sourceId: 'saved' }), true);
  assert.equal(await downloaded(null, { sourceId: 'automatic' }), false);
  assert.equal(await downloaded(null, { sourceId: 'other' }), false);
});

test('cache cleanup preserves explicit downloads, active audio and partial transfers', async () => {
  const removed = [];
  const clear = handler('music:clear-cache', {
    fsp: { readdir: async () => ['saved.mp3', 'active.mp3', 'old.mp3', 'pending.mp3.part'].map(name => ({ name, isFile: () => true })), rm: async file => removed.push(file) },
    audioCacheDirectory: () => '/cache', protectedAudio: new Map([['active', Date.now()]]),
    pinnedSources: async () => new Set(['saved']), safeAudioCacheName: value => value, path, Date,
  });
  await clear();
  assert.deepEqual(removed, [path.join('/cache', 'old.mp3')]);
});
