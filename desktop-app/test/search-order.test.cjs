const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/renderer/renderer.js'),'utf8');
test('search preserves song relevance and interleaves artist and album rows in server order',async()=>{
  let preserveOrder=false,libraryRequests=0;
  const context={
    state:{searchRequestId:0},beginView:()=>1,currentView:()=>true,setPageHeader(){},setLoading(){},
    contentView:{innerHTML:''},
    document:{querySelectorAll:()=>[],createElement:()=>({content:{querySelectorAll:()=>[
      {outerHTML:'<article>Superpowers</article>'},{outerHTML:'<article>A different song</article>'}
    ]}})},
    contentIdentity:s=>s.id,escapeHtml:s=>String(s),icon:()=>'',coverMarkup:()=>'',
    songRows:(songs,text,options)=>{preserveOrder=options.preserveOrder;return '';},
    bindGenreActions(){},bindSongActions(){},$:()=>null,handleAuthenticationError:async()=>false,
    window:{nation:{getLibrary:async()=>{libraryRequests++;throw Error('search must not await the account library')},smartSearch:async()=>({
      songs:[{id:1,title:'Superpowers'},{id:2,title:'A different song'}],
      artists:[{name:'Super artist'}],albums:[{name:'Super album'}],playlists:[],genres:[],
      results:[{type:'song',index:0},{type:'artist',index:0},{type:'album',index:0},{type:'song',index:1}],
    })}},
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('async function renderSearch('),source.indexOf('async function renderArtist(')),context);
  await context.renderSearch('sup');
  const html=context.contentView.innerHTML;
  assert.equal(preserveOrder,true);
  assert.equal(libraryRequests,0);
  assert.ok(html.indexOf('Superpowers')<html.indexOf('Super artist'));
  assert.ok(html.indexOf('Super artist')<html.indexOf('Super album'));
  assert.ok(html.indexOf('Super album')<html.indexOf('A different song'));
  assert.doesNotMatch(html,/<h2>Artistas|<h2>Álbuns|<h2>Músicas/);
});
