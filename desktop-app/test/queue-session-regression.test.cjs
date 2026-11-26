const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/renderer/renderer.js'),'utf8');
function radioHarness(rows, ended=false) {
 const state={queue:[{sourceId:'seed'},{sourceId:'current'},{sourceId:'manual',queueOrigin:'manual'}],queueIndex:1,queueRevision:3,queueMode:'selection',radioAnchor:{sourceId:'seed'}};
 let loads=0,anchor;
 const audio={ended,pause(){throw Error('prefetch must not pause')}};
 const c=vm.createContext({state,audio,window:{nation:{getRadio:async song=>{anchor=song;return rows;}},setTimeout(){}},songIdentity:s=>s.sourceId,schedulePersistPlaybackSession(){},loadCurrentTrack:async()=>loads++,$:()=>({classList:{contains:()=>true}}),Date});
 vm.runInContext(source.slice(source.indexOf('async function continueWithDailyRecommendations('),source.indexOf('function reportCurrentPlayback(')),c);
 return {state,c,get loads(){return loads},get anchor(){return anchor}};
}
test('radio prefetch appends without skipping or overriding manual queue and keeps original seed',async()=>{
 const h=radioHarness([{sourceId:'related'},{sourceId:'manual'}]);
 await h.c.continueWithDailyRecommendations(false);
 assert.equal(h.state.queueIndex,1);assert.equal(h.loads,0);assert.equal(h.anchor.sourceId,'seed');
 assert.deepEqual(Array.from(h.state.queue,s=>s.sourceId),['seed','current','manual','related']);
});
test('end reached while prefetch was pending advances to the newly added batch',async()=>{
 const h=radioHarness([{sourceId:'related'}],true);await h.c.continueWithDailyRecommendations(false);
 assert.equal(h.loads,1);assert.equal(h.state.queueIndex,3);
});
test('exhausted related catalogue may recycle played tracks but never upcoming ones',async()=>{
 const h=radioHarness([{sourceId:'seed'},{sourceId:'manual'},{sourceId:'current'}]);
 await h.c.continueWithDailyRecommendations(false);
 assert.deepEqual(Array.from(h.state.queue,s=>s.sourceId),['seed','current','manual','seed']);
});
test('latest song gets its own recommendations even while an older radio request is pending',async()=>{
 const pending=[];const state={queue:[{sourceId:'a'}],queueRevision:0,queueMode:'selection'};
 const c=vm.createContext({state,window:{nation:{getRadio:()=>new Promise(resolve=>pending.push(resolve))}},recommendationAffinity:()=>0,songIdentity:s=>s.sourceId,$:()=>null,prefetchNextTracks(){},schedulePersistPlaybackSession(){}});
 vm.runInContext(source.slice(source.indexOf('async function seedRecommendationsForSingleSong('),source.indexOf('function reorderUpcomingQueue(')),c);
 const first=c.seedRecommendationsForSingleSong({sourceId:'a'},0);
 state.queue=[{sourceId:'b'}];state.queueRevision=1;
 const second=c.seedRecommendationsForSingleSong({sourceId:'b'},1);
 pending[1]([{sourceId:'b-related'}]);await second;pending[0]([{sourceId:'a-related'}]);await first;
 assert.deepEqual(Array.from(state.queue,s=>s.sourceId),['b','b-related']);
});
test('a newer account session restores the exact last song even if removed from its playlist',async()=>{
 let played;const state={queue:[{sourceId:'old'}],queueRevision:1,lastPlaybackActivityAt:10};
 const c=vm.createContext({state,audio:{paused:true},window:{nation:{getPlaylistSongs:async()=>[{sourceId:'different'}]}},songIdentity:s=>s.sourceId,playQueue:(songs,index)=>played={songs,index}});
 vm.runInContext(source.slice(source.indexOf('async function restoreHomePlaybackPaused('),source.indexOf('async function renderHome(')),c);
 await c.restoreHomePlaybackPaused({song:{sourceId:'last',id:'last'},updatedAt:20,contextId:'1',contextType:'global',positionSeconds:5});
 assert.equal(played.songs[played.index].sourceId,'last');
 played=null;await c.restoreHomePlaybackPaused({song:{sourceId:'stale'},updatedAt:5});assert.equal(played,null);
});
