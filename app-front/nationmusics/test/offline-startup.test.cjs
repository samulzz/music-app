const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../services/player.ts'), 'utf8');
const restore = source.slice(source.indexOf('async function restorePersistedPlaybackSession('), source.indexOf('function telemetrySong('));

function harness(queueIndex) {
  const calls = {headers: 0, prefetch: 0, persist: 0, paused: 0};
  let queue = [];
  const session = {savedAt: Date.now(), queueIndex, volume: .4, positionSeconds: 12, queue: [
    {song: {id: '1', title:'Remote', sourceId:'remote'}},
    {song: {id: '2', title:'Local', sourceId:'local', localUri:'file:///valid.mp3'}},
  ]};
  const context = {
    playbackSessionRestoring: false, playbackQueueRevision: 0, playbackContext: null,
    PLAYBACK_SESSION_KEY: 'session', PLAYBACK_SESSION_MAX_AGE_MS: 100000,
    AsyncStorage: {getItem: async () => JSON.stringify(session)},
    deviceIsOffline: async () => true,
    mergeWithOfflineLibrary: async songs => songs,
    getMediaHeaders: async () => {calls.headers++; return {};},
    toMediaItem: song => ({mediaId: song.id, url: song.localUri || 'https://remote'}),
    emitShuffleEnabled: () => {}, prefetchNextInQueue: () => calls.prefetch++,
    schedulePersistPlaybackSession: () => calls.persist++,
    TrackPlayer: {getQueue: () => queue, setVolume: () => {}, setMediaItems: items => queue=items,
      seekTo: () => {}, pause: () => calls.paused++},
  };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(restore, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText, context);
  return {context, calls, getQueue: () => queue};
}

test('offline cold startup restores only local files, paused and without preloading', async () => {
  const h=harness(1); await h.context.restorePersistedPlaybackSession(0);
  assert.equal(h.getQueue().length,1); assert.equal(h.getQueue()[0].url,'file:///valid.mp3');
  assert.equal(h.calls.headers,0); assert.equal(h.calls.prefetch,0); assert.equal(h.calls.paused,1);
});
test('unreachable active track is not sent to native player and does not erase saved session', async () => {
  const h=harness(0); await h.context.restorePersistedPlaybackSession(0);
  assert.equal(h.getQueue().length,0); assert.equal(h.calls.headers,0); assert.equal(h.calls.persist,0);
});
test('native initialization failure is contained instead of becoming an unhandled startup promise', async () => {
  const h=harness(0); h.context.TrackPlayer.getQueue=() => {throw Error('not ready');};
  await assert.doesNotReject(() => h.context.restorePersistedPlaybackSession(0));
  assert.equal(h.context.playbackSessionRestoring,false);
});
