/* Mini Kibana Discover Refactor
   Phase: Parser augmentation (NOT, exists), 500-event synthetic dataset with required schema, base virtualization.
*/
(()=>{
  // ---------------- State ----------------
  const state = {
    raw: [],           // full dataset
    view: [],          // filtered dataset
    fields: new Set(),
    selectedColumns: ['@timestamp','_source'],
    time: { from:null, to:null, spanMinutes:45 },
    hist: { buckets:[], intervalMs:30000 }, // start with 30s target
    query: '',
    kqlEnabled: true,
    parseError: null,
    virtualization: { rowHeight:34, viewportEl:null, contentEl:null, totalHeight:0, start:0, end:0 },
    generatedAt:null,
    incident: { start:null, end:null },
  };
  const STORAGE_KEY='miniKibanaPrefs_v1';
  function loadPrefs(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')||{}; }catch(e){ return {}; } }
  function savePrefs(p){ localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }
  const prefs = loadPrefs();
  if(prefs.darkMode){ document.documentElement.classList.add('dark'); document.body.classList.add('dark'); }
  if(typeof prefs.lastQuery==='string') state.query = prefs.lastQuery;

  // --------------- Utils -----------------
  const rand = (n)=> Math.floor(Math.random()*n);
  const choice = (a)=> a[rand(a.length)];
  const pad = (n)=> n<10? '0'+n : ''+n;
  function iso(ts){ return new Date(ts).toISOString(); }
  function formatRange(a,b){ return `${new Date(a).toLocaleString()} – ${new Date(b).toLocaleString()}`; }
  function escapeHtml(str){ return String(str).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

  // --------------- Synthetic Dataset (≈500 events) ---------------
  function generateSynthetic(){
    const now = Date.now();
    const minutes = state.time.spanMinutes; // 45
    const end = now;
    const start = end - minutes*60000;
    state.time.from = new Date(start);
    state.time.to = new Date(end);
    // incident 7 minute window centered-ish
    const mid = start + (minutes/2)*60000;
    state.incident.start = new Date(mid - 3.5*60000);
    state.incident.end = new Date(mid + 3.5*60000);

    const levels = ['INFO','INFO','INFO','WARN','ERROR'];
    const messages = ['ingress.accept','upstream.call','authz.decision','login.fail','idp.error','cache.hit','cache.miss','metrics.flush'];
    const idps = ['okta','azuread','onelogin','auth0','adfs'];
    const namespaces = ['auth','edge','gateway','payments'];
    const pods = ['auth-api','edge-proxy','gw-core','idp-sync'];
    const containers = ['app','sidecar','metrics'];

    const data=[];
    let reqCounter=0;
    const tenantPool = Array.from({length:14},(_,i)=>`tenant-${(i+1).toString().padStart(2,'0')}`);

    // create some chained request sequences
    function emit(ts, level, msg, rid, tenant){
      const tenant_id = Math.random()<0.15 ? undefined : tenant || choice(tenantPool);
      const ev = {
        '@timestamp': iso(ts),
        'data.level': level,
        'data.message': msg,
        'data.tenant_id': tenant_id,
        'data.request_id': rid,
        idp: choice(idps),
        'kubernetes.container_name': choice(containers),
        'kubernetes.pod_name': choice(pods),
        'kubernetes.namespace_name': choice(namespaces),
      };
      ev._source = `[${ev['@timestamp']}] ${ev['data.level']} req=${rid} msg=${msg}${tenant_id? ' tenant='+tenant_id:''}`;
      data.push(ev);
    }

    for(let m=0;m<minutes;m++){
      const minuteStart = start + m*60000;
      const inIncident = minuteStart>=state.incident.start.getTime() && minuteStart<state.incident.end.getTime();
      const base = 6 + rand(6); // 6..11 events per minute baseline
      const count = inIncident ? Math.round(base*2.2) : base;
      for(let i=0;i<count;i++){
        const ts = minuteStart + rand(60000);
        const rid = 'REQ-'+(++reqCounter);
        // create sequence sometimes
        if(Math.random()<0.25){
          const tenant = choice(tenantPool);
          const seqBase = ts;
            emit(seqBase, 'INFO','ingress.accept', rid, tenant);
            emit(seqBase+rand(400), 'INFO','upstream.call', rid, tenant);
            emit(seqBase+rand(800)+800, 'INFO','authz.decision', rid, tenant);
        } else {
          let msg = choice(messages);
          let level = choice(levels);
          if(inIncident && (msg==='login.fail' || Math.random()<0.35)){
            msg='login.fail';
            if(Math.random()<0.55) level='ERROR';
          }
          if(inIncident && Math.random()<0.1){ msg='idp.error'; level='ERROR'; }
          emit(ts, level, msg, rid);
        }
      }
    }
    data.sort((a,b)=> a['@timestamp']<b['@timestamp']?-1:1);
    state.raw = data;
    state.generatedAt = new Date();
    indexFields();
    buildHistogram();
    state.view = data;
  }

  function indexFields(){
    state.fields.clear();
    for(const ev of state.raw){ for(const k in ev){ if(k !== '_expanded') state.fields.add(k); } }
  }

  // --------------- KQL Parser (extended) ---------------
  // Supports: AND OR NOT, parentheses, field:value, phrase "...", wildcard suffix *, exists via field:* pattern
  function parseKQL(input){
    const src = input.trim(); if(!src) return {type:'match_all'};
    const tokens = tokenize(src); let pos=0;
    function peek(){return tokens[pos];}
    function eat(){return tokens[pos++];}
    function parseExpression(){
      let node = parseTerm();
      while(peek() && (peek().type==='AND' || peek().type==='OR')){
        const op = eat().type.toLowerCase();
        const right = parseTerm();
        node = { type: op, left: node, right };
      }
      return node;
    }
    function parseTerm(){
      let t = peek(); if(!t) return {type:'match_all'};
      if(t.type==='NOT'){ eat(); return { type:'not', value: parseTerm() }; }
      if(t.type==='LPAREN'){ eat(); const e=parseExpression(); if(peek() && peek().type==='RPAREN') eat(); return e; }
      if(t.type==='WORD'){
        eat();
        if(peek() && peek().type==='COLON'){
          eat();
          const v = eat();
          if(!v || !['WORD','PHRASE','WILDCARD','STAR'].includes(v.type)) throw new Error('Expected value after :');
          if(v.type==='STAR') return { type:'exists', field:t.value };
          return { type:'term', field:t.value, value:v.value, wildcard:v.type==='WILDCARD', phrase:v.type==='PHRASE' };
        }
        return { type:'any', value:t.value };
      }
      throw new Error('Unexpected token '+t.type);
    }
    const ast = parseExpression();
    if(pos<tokens.length) throw new Error('Trailing input');
    return ast;
  }
  function tokenize(str){
    const out=[]; let i=0; const word=/[A-Za-z0-9_\.\-]+/y;
    while(i<str.length){
      const c=str[i];
      if(/\s/.test(c)){ i++; continue; }
      if(c==='('){ out.push({type:'LPAREN'}); i++; continue; }
      if(c===')'){ out.push({type:'RPAREN'}); i++; continue; }
      if(c===':'){ out.push({type:'COLON'}); i++; continue; }
      if(c==='"'){
        let j=i+1, buf=''; while(j<str.length && str[j] !== '"'){ buf+=str[j++]; }
        if(j>=str.length) throw new Error('Unclosed quote'); out.push({type:'PHRASE', value:buf}); i=j+1; continue;
      }
      if(c==='*'){ out.push({type:'STAR'}); i++; continue; }
      word.lastIndex=i; const m=word.exec(str);
      if(m){ let val=m[0]; i=word.lastIndex; const up=val.toUpperCase();
        if(['AND','OR','NOT'].includes(up)) out.push({type:up}); else if(val.endsWith('*')) out.push({type:'WILDCARD', value:val.slice(0,-1)}); else out.push({type:'WORD', value:val});
        continue; }
      throw new Error('Bad char '+c);
    }
    return out;
  }
  function evalAst(ast, ev){
    switch(ast.type){
      case 'match_all': return true;
      case 'any': return (ev._source||'').toLowerCase().includes(ast.value.toLowerCase());
      case 'term': {
        const v = ev[ast.field]; if(v==null) return false; const test=String(v).toLowerCase(); const needle=ast.value.toLowerCase();
        if(ast.wildcard) return test.startsWith(needle); if(ast.phrase) return test===needle; return test.includes(needle);
      }
      case 'exists': return ev[ast.field] != null;
      case 'and': return evalAst(ast.left,ev) && evalAst(ast.right,ev);
      case 'or': return evalAst(ast.left,ev) || evalAst(ast.right,ev);
      case 'not': return !evalAst(ast.value, ev);
      default: return true;
    }
  }

  // --------------- Histogram ---------------
  function buildHistogram(){
    const from = state.time.from.getTime();
    const to = state.time.to.getTime();
    const span = to - from;
    const targetBuckets = Math.min(120, Math.max(30, Math.round(span/30000))); // ~30s buckets
    const interval = Math.max(10000, Math.round(span/targetBuckets));
    state.hist.intervalMs = interval;
    const bucketCount = Math.ceil(span/interval);
    const buckets = Array(bucketCount).fill(0);
    for(const ev of state.view.length? state.view : state.raw){
      const t = new Date(ev['@timestamp']).getTime();
      if(t<from || t>to) continue;
      const idx = Math.floor((t-from)/interval); if(idx>=0 && idx<bucketCount) buckets[idx]++;
    }
    state.hist.buckets = buckets.map((c,i)=>({ts: from + i*interval, count:c}));
    renderHistogram();
  }
  function renderHistogram(){
    const canvas=document.getElementById('histogram'); if(!canvas) return; const ctx=canvas.getContext('2d');
    const w=canvas.width=canvas.clientWidth; const h=canvas.height=140; ctx.clearRect(0,0,w,h);
    const buckets=state.hist.buckets; if(!buckets.length) return; const max=Math.max(...buckets.map(b=>b.count))||1; const bw=w/buckets.length;
    ctx.fillStyle='#e2e8f0';
    buckets.forEach((b,i)=>{ const barH=(b.count/max)*(h-30); ctx.fillRect(i*bw+1, h-barH-6, bw-2, barH); });
    document.getElementById('histHits').textContent = `${state.view.length||state.raw.length} hits`;
    document.getElementById('timeWindowLabel').textContent = formatRange(state.time.from, state.time.to);
  }

  // --------------- Query Execution ---------------
  function runQuery(){
    const qInput = document.getElementById('kqlInput');
    state.query = qInput.value.trim(); prefs.lastQuery = state.query; savePrefs(prefs);
    if(!state.kqlEnabled){ // substring search across _source
      state.view = state.raw.filter(ev=> ev._source.toLowerCase().includes(state.query.toLowerCase()));
    } else {
      let ast=null; state.parseError=null;
      try { ast = parseKQL(state.query); } catch(e){ state.parseError = e.message; }
      if(ast && !state.parseError){
        const fromMs=state.time.from.getTime(), toMs=state.time.to.getTime();
        state.view = state.raw.filter(ev=> { const t=new Date(ev['@timestamp']).getTime(); if(t<fromMs||t>toMs) return false; return evalAst(ast, ev); });
      } else {
        state.view = [];
      }
    }
    renderResults();
    buildHistogram();
    renderQueryError();
  }
  function renderQueryError(){
    const container=document.getElementById('filterChips');
    if(!container) return; if(state.parseError){ container.innerHTML=`<span class="filter-chip" style="background:#b91c1c;color:#fff;">Query error: ${escapeHtml(state.parseError)}</span>`; } else if(!state.query){ container.innerHTML=''; }
  }

  // --------------- Virtualization ---------------
  function initVirtualization(){
    const vp=document.getElementById('resultsViewport'); const content=document.getElementById('resultsContent');
    state.virtualization.viewportEl=vp; state.virtualization.contentEl=content; vp.addEventListener('scroll', onScroll);
  }
  function onScroll(){ schedule(); }
  let raf=false; function schedule(){ if(raf) return; raf=true; requestAnimationFrame(()=>{ raf=false; renderRows(); }); }
  function renderResults(){
    const total=state.view.length; const content=state.virtualization.contentEl; if(!content) return;
    state.virtualization.totalHeight = total * state.virtualization.rowHeight;
    content.style.height = state.virtualization.totalHeight+'px';
    document.getElementById('emptyState').style.display = total? 'none':'block';
    renderRows();
  }
  function renderRows(){
    const vp=state.virtualization.viewportEl; if(!vp) return;
    const top=vp.scrollTop; const h=vp.clientHeight; const first=Math.floor(top/state.virtualization.rowHeight);
    const visible = Math.ceil(h/state.virtualization.rowHeight)+6; const start=Math.max(0, first-3); const end=Math.min(state.view.length, start+visible);
    let html='';
    for(let i=start;i<end;i++){
      const ev=state.view[i];
      html += `<div class="result-row" data-i="${i}" style="top:${i*state.virtualization.rowHeight}px;height:${state.virtualization.rowHeight-1}px;">\n        <div class="col-time">${escapeHtml(ev['@timestamp'])}</div>\n        <div class="col-source">${escapeHtml(ev._source)}</div>\n      </div>`;
    }
    state.virtualization.contentEl.innerHTML = html;
  }

  // --------------- Event Wiring ---------------
  function wire(){
    document.getElementById('kqlInput').value = state.query;
    document.getElementById('kqlInput').addEventListener('keydown', e=> { if(e.key==='Enter'){ runQuery(); }});
    document.getElementById('refreshBtn').addEventListener('click', ()=> { generateSynthetic(); runQuery(); });
    const kqlToggle=document.getElementById('kqlToggle');
    kqlToggle.addEventListener('click', ()=> { state.kqlEnabled = !state.kqlEnabled; kqlToggle.classList.toggle('on', state.kqlEnabled); runQuery(); });
    const darkBtn=document.getElementById('darkModeBtn');
    darkBtn.addEventListener('click', ()=> { const isDark=document.body.classList.toggle('dark'); document.documentElement.classList.toggle('dark', isDark); darkBtn.textContent=isDark? 'Light':'Dark'; prefs.darkMode=isDark; savePrefs(prefs); });
    if(prefs.darkMode) darkBtn.textContent='Light';
  }

  // --------------- Init ---------------
  function init(){
    initVirtualization();
    generateSynthetic();
    runQuery();
  }
  document.addEventListener('DOMContentLoaded', ()=> { wire(); init(); });
})();
