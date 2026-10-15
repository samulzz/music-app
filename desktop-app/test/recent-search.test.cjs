const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/renderer/renderer.js'),'utf8');
const code=source.slice(source.indexOf('const recentSearchRefreshes ='),source.indexOf('async function renderSearch('));
const song={id:'7',sourceId:'source-7',title:'Selected by Alice'};
function harness(api={},storage=new Map()) {
  const state={session:{username:'alice'}};
  const context=vm.createContext({state,Map,Set,Date,JSON,String,
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    window:{nation:{recordRecentSearchSong:async()=>{throw Error('offline');},getRecentSearchSongs:async()=>[],...api}}});
  vm.runInContext(code,context); return {context,state,storage};
}
test('selection is durable immediately even when recording fails offline',async()=>{
  const h=harness();h.context.rememberDesktopRecentSearch(song);
  assert.equal(h.context.readRecentSearch('alice').songs[0].id,'7');
  await h.context.refreshDesktopRecentSearch('alice');
  const restarted=harness({},h.storage);
  assert.equal(restarted.context.readRecentSearch('alice').songs[0].id,'7');
  assert.equal(restarted.context.readRecentSearch('alice').pending.length,1);
});
test('empty response started before a selection never erases that selection',async()=>{
  let complete,calls=0;
  const h=harness({getRecentSearchSongs:()=>++calls===1?new Promise(resolve=>complete=resolve):Promise.resolve([])});
  const refresh=h.context.refreshDesktopRecentSearch('alice');
  h.context.rememberDesktopRecentSearch(song); complete([]);
  assert.equal((await refresh)[0].id,'7');
});
test('late response stays in its own account after login changes',async()=>{
  let complete;
  const h=harness({getRecentSearchSongs:()=>new Promise(resolve=>complete=resolve)});
  const refresh=h.context.refreshDesktopRecentSearch('alice');h.state.session.username='bob';complete([song]);await refresh;
  assert.equal(h.context.readRecentSearch('bob').songs.length,0);
  assert.equal(h.context.readRecentSearch('alice').songs.length,1);
});
test('unverified legacy cache is never reused for an account',()=>{
  const h=harness({},new Map([['recent-search:bob',JSON.stringify([song])]]));
  assert.equal(h.context.readRecentSearch('bob').songs.length,0);
});
