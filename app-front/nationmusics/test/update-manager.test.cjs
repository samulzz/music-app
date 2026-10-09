const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../services/update-manager.ts'),'utf8');
const target={mandatory:true,version:'1.1.40',versionCode:42,minimumVersion:'1.1.40',minimumVersionCode:42,url:'https://example.invalid/app.apk'};
function load(application,constants={expoConfig:{version:'1.1.39',android:{versionCode:40},extra:{androidVersionCode:39}}}) {
  const exports={}; let opened='';
  const context={exports,require:name => ({'expo-application':application,'expo-constants':{__esModule:true,default:constants},'expo-linking':{openURL:async url => opened=url},'react-native':{Platform:{OS:'android'}},'./config':{UPDATE_MANIFEST_URL:'https://example.invalid/update.json'}}[name]),fetch:async()=>({ok:true,json:async()=>({android:target})}),AbortController,setTimeout,clearTimeout,Date,encodeURIComponent};
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);
  return {api:exports,opened:()=>opened};
}
test('installed Android version wins over stale Expo fallback and stops update loop',async()=>{
  const {api}=load({nativeApplicationVersion:'1.1.40',nativeBuildVersion:'42'});
  const result=await api.checkForRequiredUpdate(); assert.equal(result.required,false); assert.equal(result.currentVersionCode,42);
});
test('older installed APK still requires new version',async()=>{
  const {api}=load({nativeApplicationVersion:'1.1.39',nativeBuildVersion:'41'});
  assert.equal((await api.checkForRequiredUpdate()).required,true);
});
test('missing metadata never invents an obsolete installed version',async()=>{
  const {api}=load({},{}); assert.equal((await api.checkForRequiredUpdate()).required,false);
});
test('update download URL bypasses browser cache',async()=>{
  const h=load({nativeApplicationVersion:'1.1.39',nativeBuildVersion:'41'});
  await h.api.openUpdateDownload(await h.api.checkForRequiredUpdate()); assert.match(h.opened(),/version=1\.1\.40&t=\d+/);
});
test('release metadata agrees between Android, Expo and npm',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../app.json'),'utf8')).expo;
  const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,'../package.json'),'utf8'));
  const gradle=fs.readFileSync(path.join(__dirname,'../android/app/build.gradle'),'utf8');
  assert.equal(config.version,pkg.version); assert.equal(config.android.versionCode,config.extra.androidVersionCode);
  assert.equal(Number(gradle.match(/versionCode\s+(\d+)/)[1]),config.android.versionCode);
  assert.equal(gradle.match(/versionName\s+"([^"]+)"/)[1],config.version);
});
