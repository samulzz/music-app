const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/renderer/renderer.js'),'utf8');
test('Android remote volume never changes saved desktop gain, and returning to PC restores its slider',()=>{
 const elements=Object.fromEntries(['#volume','#volume-value','#mute-button'].map(id=>[id,{style:{setProperty(){}},setAttribute(){}}]));
 const state={volumeSliderValue:17,connectState:{currentDeviceActive:false,devices:[{active:true,platform:'android'}]}};
 const c=vm.createContext({state,$:id=>elements[id],clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),icon:x=>x});
 vm.runInContext(source.slice(source.indexOf('function isAndroidPlayback('),source.indexOf('function removeUpdateGate(')),c);
 c.updateVolumeUi();assert.equal(elements['#volume'].disabled,true);assert.equal(elements['#volume'].value,'100');assert.equal(state.volumeSliderValue,17);
 state.connectState={currentDeviceActive:true,devices:[{active:true,platform:'desktop'}]};c.updateVolumeUi();
 assert.equal(elements['#volume'].disabled,false);assert.equal(elements['#volume'].value,'17');assert.equal(state.volumeSliderValue,17);
});
