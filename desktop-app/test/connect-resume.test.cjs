const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
test('remote clock is bounded by duration even after hours away', () => {
  const context = vm.createContext({ Date, Number, Math });
  vm.runInContext(source.slice(source.indexOf('function connectEffectivePosition('), source.indexOf('function renderConnectState(')), context);
  assert.equal(context.connectEffectivePosition({ positionSeconds: 20, playing: true, durationSeconds: 120, stateUpdatedAt: Date.now() - 33000000 }), 120);
  assert.equal(context.connectEffectivePosition({ positionSeconds: 30, playing: false, durationSeconds: 120, stateUpdatedAt: 1 }), 30);
});
test('an older heartbeat response cannot pause audio after explicit takeover', async () => {
  let resolve;
  const state = { session: { token: 'token' }, connectSyncInFlight: false, queue: [], connectProcessedRevision: 0 };
  const context = vm.createContext({ state, connectControlEpoch: 0, currentConnectSong: () => null,
    connectDeviceId: () => 'desktop', audio: { paused: false, src: 'local', duration: 120, volume: 1, currentTime: 10, pause: () => assert.fail('stale response paused playback') },
    window: { nation: { updateConnectPlayback: () => new Promise(done => resolve = done) } },
    executeConnectCommand: () => assert.fail('stale command applied'), renderConnectState: () => {}, syncDiscordActivity: () => {},
    isAuthenticationError: () => false, Number,
  });
  vm.runInContext(source.slice(source.indexOf('async function syncConnectPlayback('), source.indexOf('async function controlConnectPlayback(')), context);
  const attempt = context.syncConnectPlayback();
  context.connectControlEpoch++;
  resolve({ currentDeviceActive: false });
  await attempt;
  assert.equal(state.connectSyncInFlight, false);
});
