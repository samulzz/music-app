const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/renderer/renderer.js'),'utf8');
function harness() {
  const context=vm.createContext({ state:{playbackContext:{type:'personal',id:'10'},connectState:null},
    audio:{src:'audio',paused:false,ended:false,pause(){this.paused=true;},async play(){this.paused=false;}},
    document:{querySelectorAll:()=>[]},controlConnectPlayback:async()=>{},JSON,String,Boolean });
  vm.runInContext(source.slice(source.indexOf('function samePlaybackCollection('),source.indexOf('function queueControlsMarkup(')),context);
  return context;
}
test('only the playing collection shows pause, not another playlist containing the same song',async()=>{
  const h=harness();assert.equal(h.collectionPlayback({type:'personal',id:'10'}).current,true);
  assert.equal(h.collectionPlayback({type:'personal',id:'11'}).current,false);
  assert.equal(await h.toggleCollection({type:'personal',id:'10'}),true);assert.equal(h.audio.paused,true);
  await h.toggleCollection({type:'personal',id:'10'});assert.equal(h.audio.paused,false);
});
test('remote playback uses the remote collection and playing state',()=>{
  const h=harness();h.state.connectState={song:{id:'1'},currentDeviceActive:false,contextType:'global',contextId:'50',playing:true};
  assert.equal(h.collectionPlayback({type:'global',id:'50'}).current,true);
  assert.equal(h.collectionPlayback({type:'personal',id:'10'}).current,false);
});
