const apiBase = new URL('../api', window.location.href).pathname.replace(/\/$/, '');
const tokenKey = 'nationmusics.monitoring.adminToken';
const loginView = document.querySelector('#login-view');
const dashboardView = document.querySelector('#dashboard-view');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const period = document.querySelector('#period');
const notice = document.querySelector('#notice');
let refreshTimer = null;

function token() { return sessionStorage.getItem(tokenKey) || ''; }
function formatMs(value) { const ms = Number(value) || 0; return ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s` : `${Math.round(ms)} ms`; }
function formatDate(value) { return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'medium'}).format(new Date(value)); }
function textCell(value, small) { const td=document.createElement('td'); const strong=document.createElement('strong'); strong.textContent=value||'Sem título'; td.append(strong); if(small){const el=document.createElement('small');el.textContent=small;td.append(el)} return td; }
function numberCell(value) { const td=document.createElement('td');td.className='numeric';td.textContent=value;return td; }

async function request(path, options={}) {
  const response = await fetch(`${apiBase}${path}`, { ...options, headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(token()?{'X-ADMIN-TOKEN':token()}:{}),...options.headers} });
  const raw = await response.text(); let body=raw; try{body=raw?JSON.parse(raw):null}catch{}
  if(!response.ok) { const error=new Error(typeof body==='string'?body:(body?.message||`Erro ${response.status}`));error.status=response.status;throw error; }
  return body;
}

function showLogin(message='') { clearInterval(refreshTimer);dashboardView.classList.add('hidden');loginView.classList.remove('hidden');loginError.textContent=message; }
function showDashboard() { loginView.classList.add('hidden');dashboardView.classList.remove('hidden'); refreshTimer=setInterval(()=>loadDashboard(false),30000); }

loginForm.addEventListener('submit', async event => {
  event.preventDefault(); loginError.textContent=''; const button=loginForm.querySelector('button');button.disabled=true;
  try { const result=await request('/admin/auth/login',{method:'POST',body:JSON.stringify({username:document.querySelector('#username').value,password:document.querySelector('#password').value})});sessionStorage.setItem(tokenKey,result.adminToken);document.querySelector('#password').value='';showDashboard();await loadDashboard(true); }
  catch(error){loginError.textContent=error.message||'Não foi possível entrar.'} finally{button.disabled=false}
});
document.querySelector('#logout').addEventListener('click',()=>{sessionStorage.removeItem(tokenKey);showLogin()});
document.querySelector('#refresh').addEventListener('click',()=>loadDashboard(true));
period.addEventListener('change',()=>loadDashboard(true));

function renderSummary(summary) {
  const rate=Number(summary.affectedSessionRate)||0;
  const cards=[
    ['Sessões monitoradas',summary.playbackSessions,'Reproduções iniciadas',''],
    ['Sessões afetadas',`${rate.toFixed(1)}%`,`${summary.affectedSessions} com incidente`,rate>10?'danger':rate>4?'warning':'good'],
    ['Carregamento médio',formatMs(summary.averageLoadMs),`p95 ${formatMs(summary.p95LoadMs)}`,summary.p95LoadMs>8000?'danger':summary.p95LoadMs>4000?'warning':'good'],
    ['Travamentos',summary.waiting+summary.stalled,`${summary.waiting} esperas · ${summary.stalled} stalls`,summary.waiting+summary.stalled?'warning':'good'],
    ['Erros do player',summary.errors,`${summary.incidents} incidentes totais`,summary.errors?'danger':'good'],
  ];
  const root=document.querySelector('#summary');root.replaceChildren(...cards.map(([label,value,caption,tone])=>{const el=document.createElement('article');el.className='card';el.dataset.tone=tone;const p=document.createElement('p');p.className='eyebrow';p.textContent=label;const strong=document.createElement('strong');strong.textContent=value;const small=document.createElement('small');small.textContent=caption;el.append(p,strong,small);return el}));
}

function renderCatalog(data) {
  const percent=(value,total)=>total?`${Math.round(value*100/total)}%`:'0%';
  const cards=[
    ['Músicas no catálogo',data.songs,'Total analisável'],
    ['Com álbum',percent(data.songsWithAlbum,data.songs),`${data.songsWithAlbum} identificadas`],
    ['Com gênero',percent(data.songsWithGenre,data.songs),`${data.songsWithGenre} classificadas`],
    ['Álbuns úteis',data.visibleAlbums,`${data.albums} descobertos`],
    ['Fila prioritária',data.pendingImports,`${data.importedPriorities} já importadas`],
  ];
  document.querySelector('#catalog-summary').replaceChildren(...cards.map(([label,value,caption])=>{const el=document.createElement('article');el.className='card';const p=document.createElement('p');p.className='eyebrow';p.textContent=label;const strong=document.createElement('strong');strong.textContent=value;const small=document.createElement('small');small.textContent=caption;el.append(p,strong,small);return el}));
  const job=(selector,title,item={})=>{const root=document.querySelector(selector);const updated=item.updatedAt?formatDate(item.updatedAt):'Ainda não executado';root.innerHTML='';const header=document.createElement('header');const strong=document.createElement('strong');strong.textContent=title;const time=document.createElement('time');time.textContent=`${item.state||'IDLE'} · ${updated}`;header.append(strong,time);const p=document.createElement('p');p.textContent=item.message||'Sem informações';root.append(header,p)};
  job('#album-job','Montagem de álbuns',data.albumJob);job('#genre-job','Classificação de gêneros',data.genreJob);job('#audio-job','Auditoria dos arquivos',data.audioJob);
  const issues=document.querySelector('#audio-issues');issues.replaceChildren();
  const labels={MISSING:'Arquivo ausente',TOO_SMALL:'Arquivo incompleto',CORRUPT:'Arquivo corrompido',TOO_SHORT:'Áudio muito curto',LOW_BITRATE:'Bitrate baixo',SUSPICIOUS_VERSION:'Versão suspeita',DUPLICATE_METADATA:'Possível duplicata'};
  (data.audioIssues||[]).slice(0,20).forEach(item=>{const tr=document.createElement('tr');tr.append(textCell(item.title,item.artist||item.sourceId),numberCell(labels[item.issue]||item.issue),numberCell(item.durationSeconds?`${Math.round(item.durationSeconds)} s`:'—'),numberCell(item.bitrate?`${Math.round(item.bitrate/1000)} kbps`:'—'));issues.append(tr)});
  if(!issues.children.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=4;td.className='muted';td.textContent='Nenhum alerta encontrado pela auditoria gradual.';tr.append(td);issues.append(tr)}
  document.querySelector('#catalog-updated').textContent=`Atualizado em ${formatDate(data.generatedAt)}`;
}

function renderProblems(rows) {
  const body=document.querySelector('#problem-songs');body.replaceChildren();
  if(!rows.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=4;td.className='muted';td.textContent='Nenhuma música problemática neste período.';tr.append(td);body.append(tr);return}
  rows.forEach(row=>{const tr=document.createElement('tr');tr.append(textCell(row.title,row.artist||row.sourceId),numberCell(`${row.incidents} (${row.errors} erros)`),numberCell(row.averageLoadMs?formatMs(row.averageLoadMs):'—'),numberCell(row.score));body.append(tr)});
}

function renderRecent(rows) {
  const body=document.querySelector('#recent-incidents');body.replaceChildren();
  if(!rows.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=4;td.className='muted';td.textContent='Nenhum incidente registrado.';tr.append(td);body.append(tr);return}
  rows.forEach(row=>{const tr=document.createElement('tr');tr.append(numberCell(formatDate(row.occurredAt)));const event=document.createElement('td');const badge=document.createElement('span');badge.className=`badge ${row.eventType.toLowerCase()}`;badge.textContent=row.eventType;event.append(badge);tr.append(event,textCell(row.title,row.artist),numberCell(`${row.platform} ${row.appVersion||''}`));body.append(tr)});
}

function renderTimeline(points) {
  const canvas=document.querySelector('#timeline');const scale=Math.max(1,window.devicePixelRatio||1);const width=canvas.clientWidth;const height=230;canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.clearRect(0,0,width,height);
  const pad={l:34,r:10,t:12,b:28};const chartW=width-pad.l-pad.r;const chartH=height-pad.t-pad.b;const totals=points.map(p=>p.errors+p.waiting+p.stalled);const max=Math.max(1,...totals);ctx.strokeStyle='#283029';ctx.fillStyle='#707a73';ctx.font='10px Segoe UI';ctx.textAlign='right';for(let i=0;i<=4;i++){const y=pad.t+chartH*(i/4);ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(width-pad.r,y);ctx.stroke();ctx.fillText(String(Math.round(max*(1-i/4))),pad.l-7,y+3)}
  const step=chartW/Math.max(points.length,1);const bar=Math.max(2,Math.min(15,step*.65));points.forEach((point,index)=>{let y=pad.t+chartH;const x=pad.l+index*step+(step-bar)/2;[['waiting','#f0c75e'],['stalled','#f08b4f'],['errors','#ff626f']].forEach(([key,color])=>{const h=chartH*(point[key]/max);y-=h;ctx.fillStyle=color;ctx.fillRect(x,y,bar,h)});if(index===0||index===points.length-1||index%Math.ceil(points.length/6)===0){ctx.fillStyle='#707a73';ctx.textAlign='center';ctx.fillText(new Date(point.timestamp).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),x+bar/2,height-8)}});
}

async function loadDashboard(showLoading) {
  const button=document.querySelector('#refresh');if(showLoading)button.disabled=true;
  try { const [data,catalog]=await Promise.all([request(`/admin/monitoring/dashboard?hours=${period.value}`),request('/admin/monitoring/catalog')]);renderSummary(data.summary);renderCatalog(catalog);renderProblems(data.problematicSongs);renderRecent(data.recentIncidents);renderTimeline(data.timeline);document.querySelector('#updated-at').textContent=`Atualizado em ${formatDate(data.generatedAt)}`;notice.classList.toggle('hidden',!data.summary.truncated);notice.textContent=data.summary.truncated?'A janela atingiu 20 mil eventos. Os indicadores consideram os eventos mais recentes.':''; }
  catch(error){if(error.status===401){sessionStorage.removeItem(tokenKey);showLogin('Sua sessão administrativa expirou.');return}notice.textContent=error.message||'Falha ao atualizar o painel.';notice.classList.remove('hidden')}finally{button.disabled=false}
}

window.addEventListener('resize',()=>{if(!dashboardView.classList.contains('hidden'))loadDashboard(false)});
if(token()){showDashboard();loadDashboard(true)}else showLogin();
