const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
function harness(request=async()=>({commandRevision:0})) {
  const storage=new Map(); let reads=0;
  const modules={
    '@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async key=>{reads++;return storage.get(key)||null;},setItem:async(key,value)=>storage.set(key,value)}},
    'react-native':{Platform:{OS:'android'}}, './api':{apiRequest:request}, './auth':{getSession:async()=>({username:'alice'})},
  };
  const exports={};
  const context=vm.createContext({exports,require:name=>modules[name],Date,Math,Number,Set,Promise});
  const source=fs.readFileSync(path.join(__dirname,'../services/connect.ts'),'utf8');
  vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  return {api:exports,storage,reads:()=>reads};
}
test('parallel registrations share exactly one persistent device ID',async()=>{
  const h=harness();const ids=await Promise.all(Array.from({length:20},()=>h.api.getConnectDeviceId()));
  assert.equal(new Set(ids).size,1); assert.equal(h.reads(),1);
});
test('old heartbeat is ignored after a user control request',async()=>{
  let complete;
  const h=harness(async path=>path.endsWith('heartbeat')?new Promise(resolve=>complete=resolve):{commandRevision:1});
  const pending=h.api.sendConnectHeartbeat({song:null});
  for(let i=0;i<100&&!complete;i++) await new Promise(resolve=>setImmediate(resolve));
  assert.ok(complete, 'heartbeat was dispatched');
  await h.api.sendConnectControl('SYNC');complete({currentDeviceActive:false});
  assert.equal(await pending,null); assert.equal(h.api.getLatestConnectState().commandRevision,1);
});
