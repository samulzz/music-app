const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../services/metadata-cache.ts'),'utf8');
function harness(legacy=new Map(),files=new Map(),diskFull=false){
  let sqliteWrites=0;const removed=[];let clock=0;
  class File {
    constructor(dir,name){this.uri=dir.uri+'/'+name;this.name=name}
    get exists(){return files.has(this.uri)}get size(){return Buffer.byteLength(files.get(this.uri)?.text||'')}
    get modificationTime(){return files.get(this.uri)?.time||0}
    write(text){if(diskFull)throw Error('disk full');files.set(this.uri,{text,time:++clock})}
    async text(){return files.get(this.uri).text}delete(){files.delete(this.uri)}
  }
  class Directory {constructor(parent,name){this.uri=parent+'/'+name}create(){}list(){return [...files.keys()].filter(uri=>uri.startsWith(this.uri+'/')).map(uri=>new File(this,uri.slice(this.uri.length+1)))}}
  const storage={getItem:async key=>legacy.get(key)??null,getAllKeys:async()=>[...legacy.keys()],setItem:async()=>{sqliteWrites++;throw Error('SQLITE_FULL')},removeItem:async key=>{removed.push(key);legacy.delete(key)},multiRemove:async keys=>{keys.forEach(key=>{removed.push(key);legacy.delete(key)})}};
  const exports={},context={exports,require:name=>name==='expo-file-system'?{File,Directory,Paths:{document:'document'}}:{__esModule:true,default:storage},Map,Math,JSON,setTimeout,Promise};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  return {api:exports,files,legacy,removed,storage,sqliteWrites:()=>sqliteWrites,flush:async()=>{await exports.maintainMetadataCache();for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve))}};
}
test('recovers SQLite by dropping search caches and migrating compact lists, never account or audio indexes',async()=>{
  const personal='nationmusics.personal-playlists.v1.account.alice',query='nationmusics.api-cache./catalog/search?q=test.account.alice';
  const legacy=new Map([[personal,JSON.stringify({savedAt:1,playlists:[{id:1,name:'My list',songs:Array.from({length:1000},(_,id)=>({id,title:'Song'}))}]})],[query,'old query'],
    ['nationmusics.offline-library.v2','downloads'],['nationmusics.auth.session.v2','session'],['nationmusics.playback.session.v2.account.alice','player'],['search-recent.v2.account.alice','history']]);
  const h=harness(legacy);await h.api.maintainMetadataCache();
  assert.equal(legacy.has(query),false);assert.equal(legacy.has(personal),false);
  for(const key of ['nationmusics.offline-library.v2','nationmusics.auth.session.v2','nationmusics.playback.session.v2.account.alice','search-recent.v2.account.alice'])assert.ok(legacy.has(key));
  const value=JSON.parse(await h.api.metadataCache.getItem(personal));assert.equal(value.playlists[0].songCount,1000);assert.equal(value.playlists[0].songs,undefined);assert.equal(h.sqliteWrites(),0);
});
test('full filesystem cannot break a successful library load or delete unmigrated legacy data',async()=>{
  const key='nationmusics.personal-playlists.v1.account.alice',legacy=new Map([[key,JSON.stringify({playlists:[]})]]);const h=harness(legacy,new Map(),true);
  await h.api.maintainMetadataCache();assert.ok(legacy.has(key));
  await h.api.metadataCache.setItem(key,'fresh');await h.flush();assert.equal(await h.api.metadataCache.getItem(key),'fresh');assert.equal(h.sqliteWrites(),0);
});
test('cache persists across restart, remains account scoped and ignores essential storage keys',async()=>{
  const key='nationmusics.playlist.personal.1.v2.account.alice';const h=harness();await h.api.metadataCache.setItem(key,'{"songs":[]}');await h.flush();
  const next=harness(h.legacy,h.files);assert.equal(await next.api.metadataCache.getItem(key),'{"songs":[]}');
  assert.equal(await next.api.metadataCache.getItem(key.replace('alice','bob')),null);
  await h.api.metadataCache.setItem('nationmusics.offline-library.v2','forbidden');assert.equal(await h.api.metadataCache.getItem('nationmusics.offline-library.v2'),null);
});
test('a late legacy read cannot overwrite a newer successful response',async()=>{
  const h=harness(),key='nationmusics.home-playlists.v3.account.alice';let release;
  h.storage.getItem=async()=>new Promise(resolve=>release=resolve);
  const read=h.api.metadataCache.getItem(key);while(!release)await new Promise(resolve=>setImmediate(resolve));
  await h.api.metadataCache.setItem(key,'fresh');release('old');assert.equal(await read,'fresh');
});
test('disk cache has a file count and byte budget instead of growing forever',async()=>{
  const h=harness();const value='x'.repeat(256*1024);
  for(let i=0;i<110;i++)await h.api.metadataCache.setItem('nationmusics.api-cache./catalog/albums?fixture='+i,value);
  await h.flush();assert.ok(h.files.size<=96);assert.ok([...h.files.values()].reduce((sum,row)=>sum+Buffer.byteLength(row.text),0)<=24*1024*1024);
});
