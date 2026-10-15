const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const song={id:'7',sourceId:'source-7',title:'Only Alice',artist:'Artist'};
function harness(request=async()=>[],storage=new Map()) {
  let account='alice';const exports={};
  const modules={
    '@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async key=>storage.get(key)||null,setItem:async(key,value)=>storage.set(key,value)}},
    './auth':{getSession:async()=>({username:account,token:`token-${account}`})},
    './api':{apiRequest:request},'../types/music':{fromApiSearchSong:value=>value},
  };
  const context=vm.createContext({exports,require:name=>modules[name],Date,Map,Set,Promise,JSON,String});
  const source=fs.readFileSync(path.join(__dirname,'../services/recent-search.ts'),'utf8');
  vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  return {api:exports,storage,account:name=>account=name};
}
test('offline recent selection survives restart and does not belong to another user',async()=>{
  const h=harness(async()=>{throw Error('offline');});await h.api.rememberRecentSearch(song);
  assert.equal((await h.api.getCachedRecentSearch('alice'))[0].id,'7');
  const next=harness(undefined,h.storage);
  assert.equal((await next.api.getCachedRecentSearch('alice'))[0].id,'7');
  assert.equal((await next.api.getCachedRecentSearch('bob')).length,0);
});
test('inflight empty response cannot clear a newer locally recorded song',async()=>{
  let complete;let gets=0;
  const h=harness(async(path)=>{
    if(path==='/search/recent'&&++gets===1)return new Promise(resolve=>complete=resolve);
    if(path.includes('/recent/'))throw Error('offline');return [];
  });
  const refresh=h.api.refreshRecentSearch({username:'alice',token:'token-alice'});
  for(let i=0;i<100&&!complete;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.ok(complete);await h.api.rememberRecentSearch(song);complete([]);
  assert.equal((await refresh)[0].id,'7');
});
test('requests keep the captured account token when the signed-in user changes',async()=>{
  let token;
  const h=harness(async(path,options)=>{token=options.headers.Authorization;return [];});
  h.account('bob');await h.api.refreshRecentSearch({username:'alice',token:'token-alice'});
  assert.equal(token,'Bearer token-alice');
});
test('mobile navigation transitions remain disabled',()=>{
  for(const file of ['../app/_layout.tsx','../app/(tabs)/_layout.tsx']){
    const source=fs.readFileSync(path.join(__dirname,file),'utf8');
    assert.match(source,/animation: 'none'/);assert.doesNotMatch(source,/slide_from_right|animation: 'fade'/);
  }
});
test('legacy cache cannot introduce songs from an incorrectly cached account',async()=>{
  const storage=new Map([['search-recent.v1.account.bob',JSON.stringify([song])]]);
  assert.equal((await harness(undefined,storage).api.getCachedRecentSearch('bob')).length,0);
});
