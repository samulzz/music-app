const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
test('Android always uses full player gain without inheriting PC volume; iOS keeps explicit volume',()=>{
 let gain=.08;const platform={OS:'android'};const exports={};const c=vm.createContext({exports,require:name=>name==='react-native'?{Platform:platform}:{__esModule:true,default:{setVolume:v=>gain=v,getVolume:()=>gain}}});
 const source=fs.readFileSync(path.join(__dirname,'../services/device-volume.ts'),'utf8');vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,c);
 exports.applyPlaybackVolume(.05);assert.equal(gain,1);exports.applyPlaybackVolume(0);assert.equal(gain,1);assert.equal(exports.getPlaybackVolume(),1);
 platform.OS='ios';exports.applyPlaybackVolume(.25);assert.equal(gain,.25);exports.applyPlaybackVolume(0);assert.equal(exports.getPlaybackVolume(),0);
});
