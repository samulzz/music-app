const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../services/player.ts'),'utf8');
test('Android appends a batch before the queue ends without play, seek or replacing the queue',async()=>{
 let queue=[{mediaId:'seed',extras:{sourceId:'seed'}},{mediaId:'current',extras:{sourceId:'current'}},{mediaId:'manual',extras:{sourceId:'manual'}}],played=0;let anchor;
 const c=vm.createContext({Date,Promise,recommendationSeedInFlight:null,recommendationAppendInFlight:null,radioRetryAt:0,radioAnchor:{sourceId:'seed'},playbackContext:null,playbackQueueRevision:7,lastShuffleEnabled:false,
 TrackPlayer:{getQueue:()=>queue,getActiveMediaItemIndex:()=>1,getPlaybackState:()=>2,addMediaItems:items=>queue.push(...items),skipToIndex(){throw Error('must not skip')},play:()=>played++},PlaybackState:{Ended:4},
 getLatestConnectState:()=>null,telemetrySong:s=>s,deviceIsOffline:async()=>false,mergeWithOfflineLibrary:async s=>s,getRadioSongs:async a=>{anchor=a;return [{id:'next',sourceId:'next'}]},mediaItemSourceId:i=>i.extras.sourceId,getMediaHeaders:async()=>({}),toMediaItem:s=>({mediaId:s.id,extras:{sourceId:s.sourceId}}),prefetchNextInQueue(){},schedulePersistPlaybackSession(){}});
 const code=source.slice(source.indexOf('async function continueWithDailyRecommendations('),source.indexOf('function emitShuffleEnabled('));
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);
 await c.continueWithDailyRecommendations(7);assert.equal(played,0);assert.equal(anchor.sourceId,'seed');assert.deepEqual(queue.map(s=>s.mediaId),['seed','current','manual','next']);
});
test('corrected recording never inherits the MP3 from a different source with the same song ID',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../services/offline-library.ts'),'utf8');
 const exports={};const c=vm.createContext({exports,wait:async()=>{},normalizeFilePart:s=>s,songIdentity:s=>s.sourceId,downloadedFiles:()=>new Map(),offlineLookupKeys:s=>['source:'+s.sourceId,'id:'+s.id,'content:song']});
 vm.runInContext(ts.transpileModule(source.slice(source.indexOf('export async function mergeWithOfflineLibrary('),source.indexOf('export function formatBytes(')),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,c);
 const fresh={id:'1',sourceId:'fixed',title:'Sumi'},old={id:'1',sourceId:'old-instrumental',localUri:'file://old.mp3'};
 const result=await exports.mergeWithOfflineLibrary([fresh],[old]);assert.equal(result[0].sourceId,'fixed');assert.equal(result[0].localUri,undefined);
 const current={...old,sourceId:'fixed'};const local=await exports.mergeWithOfflineLibrary([fresh],[current]);assert.equal(local[0].localUri,'file://old.mp3');
});
