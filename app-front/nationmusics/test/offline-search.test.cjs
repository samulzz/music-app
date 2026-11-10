const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(__dirname,'../services',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function apiHarness(connected,fetch,storage=new Map()){
 const exports={};let event;
 const modules={'expo-router':{router:{replace(){}}},'@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async k=>storage.get(k)||null,setItem:async(k,v)=>storage.set(k,v)}},
 '@react-native-community/netinfo':{__esModule:true,default:{addEventListener:fn=>{event=fn;fn({isConnected:connected});return()=>{}},fetch:async()=>({isConnected:connected})}},
 './auth':{getSession:async()=>({username:'alice',token:'token'}),getCachedSession:()=>({username:'alice',token:'token'}),clearSession:async()=>{}},'./config':{API_BASE_URL:'https://test.invalid',APP_HEADERS:{}}};
 const c=vm.createContext({exports,require:n=>modules[n],setTimeout,clearTimeout,fetch,Headers,AbortController,Promise});vm.runInContext(compile('api.ts'),c);
 return {api:exports,network:state=>event(state)};
}
test('all offline API calls fail fast or use cache without making a network request',async()=>{
 let calls=0;const storage=new Map([['nationmusics.api-cache./songs/my-library.account.alice',JSON.stringify({data:[{id:1}]})]]);
 const {api}=apiHarness(false,async()=>{calls++;throw Error('network')},storage);
 assert.equal((await api.apiRequest('/songs/my-library'))[0].id,1);
 await assert.rejects(api.apiRequest('/friends'),{name:'OfflineError'});
 await assert.rejects(api.apiRequest('/connect/heartbeat',{method:'POST'}),{name:'OfflineError'});
 assert.equal(calls,0);
});
test('network timeout covers the response body and does not mark the device offline',async()=>{
 let calls=0;
 const {api}=apiHarness(true,async(url,{signal})=>{calls++;return {status:200,ok:true,text:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))}});
 await assert.rejects(api.apiRequest('/catalog/search?q=test',{timeoutMs:30}),{name:'OfflineError'});
 assert.equal(calls,1);assert.equal(await api.deviceIsOffline(),false);
});
test('a superseded search aborts instead of retrying or publishing stale cached results',async()=>{
 let calls=0;const {api}=apiHarness(true,async(url,{signal})=>{calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))});
 const controller=new AbortController();const request=api.apiRequest('/catalog/search?q=old',{signal:controller.signal});
 while(!calls)await new Promise(resolve=>setImmediate(resolve));controller.abort();
 await assert.rejects(request,{name:'AbortError'});assert.equal(calls,1);
});
test('offline search matches accents, artists and albums but never cloud-only songs',()=>{
 const identity={};vm.runInNewContext(compile('song-identity.ts'),{exports:identity});
 const exports={};vm.runInNewContext(compile('local-search.ts'),{exports,require:()=>identity});
 const songs=[{id:'1',title:'Canção',artist:'Alee',album:'Disco',localUri:'file://1'},
 {id:'2',title:'Cancao do amor',artist:'Other',localUri:'file://2'},{id:'3',title:'Canção online',artist:'Alee'}];
 assert.deepEqual(Array.from(exports.searchOfflineSongs(songs,'cancao'),s=>s.id),['1','2']);
 assert.deepEqual(Array.from(exports.searchOfflineSongs(songs,'alee'),s=>s.id),['1']);
 assert.deepEqual(Array.from(exports.searchOfflineSongs(songs,'disco'),s=>s.id),['1']);
});
