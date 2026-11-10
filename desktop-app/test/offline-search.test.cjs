const {test}=require('node:test');const assert=require('node:assert/strict');const {searchOfflineSongs}=require('../src/local-search.cjs');
const fs=require('node:fs'),vm=require('node:vm');
test('offline results only include explicitly downloaded songs, ranked by title before artist',()=>{
 const songs=[{id:'cloud',title:'Canção',artist:'Cantor'},
 {id:'1',title:'Canção',artist:'Alee',downloaded:true},{id:'2',title:'Outra',artist:'Canção',downloaded:true}];
 assert.deepEqual(searchOfflineSongs(songs,'cancao').map(s=>s.id),['1','2']);
 assert.deepEqual(searchOfflineSongs(songs,'alee').map(s=>s.id),['1']);
});
test('offline results do not conflate studio and live versions',()=>{
 const rows=[{id:'1',title:'Song',artist:'Artist',downloaded:true},{id:'2',title:'Song - Ao Vivo',artist:'Artist',downloaded:true}];
 assert.equal(searchOfflineSongs(rows,'song').length,2);
});
test('offline smart-search IPC never calls the API and only uses this account downloaded index',async()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../src/main.cjs'),'utf8');const handlers=new Map();let requests=0;
 const context={Map,AbortController,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},net:{isOnline:()=>false},
 offlineSongs:async()=>[{id:'1',title:'Canção',artist:'Alee'}],normalizeSong:(song,saved)=>({...song,saved}),searchOfflineSongs,contentIdentity:s=>s.id,
 apiRequest:async()=>{requests++;throw Error('network must not be used')}};
 vm.runInNewContext(source.slice(source.indexOf('const catalogSearches ='),source.indexOf("ipcMain.handle('catalog:albums'")),context);
 const result=await handlers.get('catalog:search')({sender:{id:1}},'cancao');
 assert.equal(requests,0);assert.equal(result.offline,true);assert.equal(result.songs.length,1);assert.equal(result.songs[0].downloaded,true);
 assert.equal(result.artists.length,0);assert.equal(result.albums.length,0);
});
