const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function harness(offline,rows) {
 const exports={};let requests=0;
 const c=vm.createContext({exports,require:n=>n==='./api'?{deviceIsOffline:async()=>offline,apiRequest:async()=>{requests++;return rows}}:{fromApiLibrarySong:s=>s}});
 vm.runInContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../services/recordings.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,c);
 return {api:exports,get requests(){return requests}};
}
test('canonical correction drops only obsolete local reference, not the user download file',async()=>{
 const h=harness(false,[{id:'1',sourceId:'fixed',title:'Sumi'}]);
 const result=await h.api.refreshRecordings([{id:'1',sourceId:'old',localUri:'file://instrumental.mp3',queueOrigin:'manual'}]);
 assert.equal(result[0].sourceId,'fixed');assert.equal(result[0].localUri,undefined);assert.equal(result[0].queueOrigin,'manual');
});
test('canonical confirmation retains valid downloads and offline startup never requests metadata',async()=>{
 const song={id:'1',sourceId:'fixed',localUri:'file://fixed.mp3'};
 const online=harness(false,[{id:'1',sourceId:'fixed'}]);assert.equal((await online.api.refreshRecordings([song]))[0].localUri,song.localUri);
 const offline=harness(true,[]);assert.equal((await offline.api.refreshRecordings([song]))[0],song);assert.equal(offline.requests,0);
});
