const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
const read=name=>fs.readFileSync(path.join(__dirname,'../services',name),'utf8');
test('server failure cannot mark a connected device offline',async()=>{
 const source=read('api.ts');const code=source.slice(source.indexOf('export async function deviceIsOffline('),source.indexOf('async function handleInvalidSession('));
 const exports={};const c=vm.createContext({exports,serverUnavailable:true,NetInfo:{fetch:async()=>({isConnected:true})}});
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,c);
 assert.equal(await exports.deviceIsOffline(),false);c.NetInfo.fetch=async()=>({isConnected:false});assert.equal(await exports.deviceIsOffline(),true);
});
test('same recording is deduplicated with local file preferred, live version stays separate',()=>{
 const exports={};const c=vm.createContext({exports});vm.runInContext(ts.transpileModule(read('song-identity.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,c);
 const songs=[{id:'new',title:'Canção',artist:'Cantor'},{id:'local',title:'Cancao',artist:'Cantor',localUri:'file://song.mp3'},{id:'live',title:'Canção - Ao Vivo',artist:'Cantor'}];
 const result=exports.uniqueSongs(songs);assert.equal(result.length,2);assert.equal(result[0].localUri,'file://song.mp3');
});
test('simultaneous native completions never overwrite another downloaded entry',async()=>{
 const source=read('offline-library.ts');const code=source.slice(source.indexOf('export async function upsertOfflineSong('),source.indexOf('const syncedDownloads'));
 let rows=[];const exports={};const c=vm.createContext({exports,indexMutations:Promise.resolve(),readIndex:async()=>rows,songIdentity:s=>s.id,writeIndex:async next=>{await new Promise(r=>setImmediate(r));rows=next;},syncDownloadedSong:async()=>{}});
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,c);
 await Promise.all(Array.from({length:12},(_,i)=>exports.upsertOfflineSong({id:String(i),localUri:'file://'+i})));
 assert.equal(rows.length,12);
});
