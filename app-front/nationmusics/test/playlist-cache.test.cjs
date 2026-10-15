const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');const ts=require('typescript');
test('warm playlists are immediately available and never shared between accounts',()=>{
  const exports={};const context=vm.createContext({exports,Map,Date});
  const source=fs.readFileSync(path.join(__dirname,'../services/playlist-cache.ts'),'utf8');
  vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  const value={savedAt:Date.now(),songs:[{id:'1',title:'Song',localUri:'file:///song.mp3'}]};
  exports.rememberPlaylistSnapshot('library.account.alice',value);
  assert.equal(exports.readPlaylistSnapshot('library.account.alice'),value);
  assert.equal(exports.readPlaylistSnapshot('library.account.bob'),undefined);
  exports.rememberPlaylistSnapshot('daily.account.alice',{...value,savedAt:Date.now()-86400000});
  assert.equal(exports.readPlaylistSnapshot('daily.account.alice',true),undefined);
});
test('playlist hydration uses the lightweight index and releases controls before network refresh',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../app/playlist/[id].tsx'),'utf8');
  const hydration=source.slice(source.indexOf('const hydrateSongs ='),source.indexOf('useEffect(() => {\n    hydratedRef'));
  assert.match(hydration,/validateFiles: false/);
  assert.ok(hydration.indexOf('setLoading(false)')<hydration.indexOf('void loadSongs(false, true)'));
});
function offlineHarness() {
  const source=fs.readFileSync(path.join(__dirname,'../services/offline-library.ts'),'utf8');
  const rows=Array.from({length:32},(_,i)=>({id:String(i),localUri:`file:///${i}.mp3`}));
  const calls={reads:0,checks:0,yields:0};
  const context=vm.createContext({INDEX_KEY:'index',indexSnapshot:null,indexRead:null,indexRevision:0,validatedSnapshot:null,validation:null,
    AsyncStorage:{getItem:async()=>{calls.reads++;return JSON.stringify(rows);}},Date,JSON,
    wait:async()=>{calls.yields++;await new Promise(resolve=>setImmediate(resolve));},
    withResolvedOfflineFile:song=>{calls.checks++;return song;},
  });
  const code=source.slice(source.indexOf('async function readIndex('),source.indexOf('export async function findOfflineSong('));
  const exports={};context.exports=exports;
  vm.runInContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  return {api:exports,calls,context};
}
test('lightweight offline index does not inspect files or repeatedly parse storage',async()=>{
  const h=offlineHarness();await h.api.getOfflineLibrary({validateFiles:false});await h.api.getOfflineLibrary({validateFiles:false});
  assert.equal(h.calls.reads,1);assert.equal(h.calls.checks,0);
});
test('validation is shared, yields to touches, and is reused on warm opens',async()=>{
  const h=offlineHarness();await Promise.all([h.api.getOfflineLibrary(),h.api.getOfflineLibrary()]);await h.api.getOfflineLibrary();
  assert.equal(h.calls.checks,32);assert.equal(h.calls.yields,4);assert.equal(h.calls.reads,1);
});
test('a background validation cannot overwrite a download added during its scan',async()=>{
  const h=offlineHarness();const operation=h.api.getOfflineLibrary();
  await new Promise(resolve=>setImmediate(resolve));
  h.context.indexRevision++;
  h.context.indexSnapshot=[...h.context.indexSnapshot,{id:'new',localUri:'file:///new.mp3'}];
  const value=await operation;
  assert.equal(value.length,33);assert.equal(value.at(-1).id,'new');
});
