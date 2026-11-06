const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
class Element {
  children=[];textContent='';value='';events={};classList={remove(){}};
  append(...items){this.children.push(...items)}
  replaceChildren(...items){this.children=items}
  addEventListener(name,fn){this.events[name]=fn}
}
function setup(rows,view='warnings'){
  const nodes=new Map(['#audio-progress','#audio-view','#audio-search','#audio-issues'].map(id=>[id,new Element()]));
  nodes.get('#audio-view').value=view;
  const c={lastAudioCatalog:{songs:10,audioReviewed:1,audioWarnings:1,audioPending:9,audioComplete:1,audioIssues:rows,audioRecent:rows},
    document:{querySelector:id=>nodes.get(id),createElement:()=>new Element()},formatDate:()=> 'date',request:async()=>{},loadDashboard:async()=>{},notice:new Element(),encodeURIComponent};
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('function textCell('),source.indexOf('async function request('))+source.slice(source.indexOf('function renderAudioQuality('),source.indexOf('function renderSummary(')),c);
  c.renderAudioQuality();return {nodes,c};
}
function text(node){return node.textContent+' '+node.children.map(text).join(' ')}
test('shows measurements, evidence, original source link and a protected recheck action',async()=>{
  const {nodes,c}=setup([{songId:7,title:'<img onerror=alert(1)>',artist:'Artist',issue:'LOW_VOLUME',integratedLufs:-30,truePeakDb:-4,silenceRatio:0,bitrate:128000,sourceId:'abcdefghijk',sourceTitle:'Official audio',sourceStatus:'RESOLVED',confidence:1,state:'COMPLETE',checkedAt:1,details:'Measured on file'}]);
  const row=nodes.get('#audio-issues').children[0];const rendered=text(row);
  assert.match(rendered,/-30.0 LUFS/);assert.match(rendered,/0% silêncio/);assert.match(rendered,/Volume baixo/);assert.match(rendered,/Measured on file/);
  assert.equal(row.children[0].children[0].textContent,'<img onerror=alert(1)>');
  assert.equal(row.children[3].children.at(-1).href,'https://www.youtube.com/watch?v=abcdefghijk');
  let requested;c.request=async(path,options)=>requested={path,options};
  await row.children.at(-1).children[0].events.click();
  assert.equal(requested.path,'/admin/monitoring/audio/7/recheck');assert.equal(requested.options.method,'POST');
});
test('empty warnings disclose coverage instead of declaring the whole catalog healthy',()=>{
  const {nodes}=setup([]);assert.match(text(nodes.get('#audio-issues')),/não garante/);assert.match(nodes.get('#audio-progress').textContent,/1\/10/);
});
test('filter works across artist and original channel without removing persisted rows',()=>{
  const {nodes,c}=setup([{songId:1,title:'Sumi',artist:'Lywie',issue:'OK',sourceChannel:'Official Artist',state:'COMPLETE'}],'recent');
  nodes.get('#audio-search').value='nonexistent';c.renderAudioQuality();assert.match(text(nodes.get('#audio-issues')),/Nenhum resultado/);
  nodes.get('#audio-search').value='official artist';c.renderAudioQuality();assert.match(text(nodes.get('#audio-issues')),/Sumi/);
});
