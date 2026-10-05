const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname,'../src/renderer/renderer.js'),'utf8');
const recovery = source.slice(source.indexOf('async function recoverDesktopPlayback('),source.indexOf('async function loadCurrentTrack('));

test('a stale recovery never overrides a new track selection', async () => {
  let complete,loaded=0;
  const state={queue:[{sourceId:'old'}],queueIndex:0,trackLoadRequestId:1,recoveredSourceIds:new Set(),connectState:null};
  const context={state,audio:{currentTime:42,paused:false},Number,preparedStreamUrls:new Map(),
    songIdentity:s=>s?.sourceId,window:{nation:{invalidateStream:()=>new Promise(resolve=>complete=resolve)}},
    loadCurrentTrack:async()=>loaded++};
  vm.createContext(context);vm.runInContext(recovery,context);
  const attempt=context.recoverDesktopPlayback(true);
  state.queue=[{sourceId:'new'}];state.trackLoadRequestId++;
  complete();await attempt;
  assert.equal(loaded,0);assert.equal(state.pendingResumePosition,undefined);
});
test('a current recovery preserves position and paused intent', async () => {
  let autoplay;
  const state={queue:[{sourceId:'track'}],queueIndex:0,trackLoadRequestId:1,recoveredSourceIds:new Set(),connectState:null};
  const context={state,audio:{currentTime:42,paused:true},Number,preparedStreamUrls:new Map(),
    songIdentity:s=>s?.sourceId,window:{nation:{invalidateStream:async()=>{}}},loadCurrentTrack:async value=>autoplay=value};
  vm.createContext(context);vm.runInContext(recovery,context);
  await context.recoverDesktopPlayback(true);
  assert.equal(state.pendingResumePosition,42);assert.equal(autoplay,false);
});
