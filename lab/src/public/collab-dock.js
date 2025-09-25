// Collaborative Dock: Quill + Yjs + y-websocket
// Minimal real-time global document shared across all pages.
// Room name: global-case-study (can be expanded per-task later)

(function(){
  const DOCK_ID = 'collabDock';
  if(document.getElementById(DOCK_ID)) return; // prevent duplicates

  // Lazy load dependencies via CDN if not present.
  function loadScript(src){ return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=()=>rej(new Error('load '+src)); document.head.appendChild(s); }); }
  function loadStyle(href){ const l=document.createElement('link'); l.rel='stylesheet'; l.href=href; document.head.appendChild(l); }

  // Insert dock shell
  const dock = document.createElement('div');
  dock.className='collab-dock';
  dock.id=DOCK_ID;
  dock.innerHTML=`<div class="collab-dock-header" aria-expanded="false" tabindex="0">\n      <h4>Editor <span class="arrow">\u25B2</span>\n        <button class="mode-btn" id="btnPop" title="Open fullscreen">Open</button>\n        <button class="mode-btn" id="btnClose" title="Close editor">Close</button>\n      </h4>\n    </div>\n    <div class="collab-dock-body" style="display:none;">\n      <div id="collabEditor" class="quill"></div>\n    </div>`;
  document.body.appendChild(dock);
  const backdrop = document.createElement('div'); backdrop.className='collab-dock-backdrop'; document.body.appendChild(backdrop);

  const header = dock.querySelector('.collab-dock-header');
  const body = dock.querySelector('.collab-dock-body');
  header.addEventListener('click', (e)=>{ if(e.target.closest('.mode-btn')) return; toggle(); });
  header.addEventListener('keydown', e=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); toggle(); }});
  let openOnce=false;
  function toggle(forceOpen){
    if(typeof forceOpen==='boolean'){
      if(forceOpen) dock.classList.add('open'); else dock.classList.remove('open');
    } else {
      dock.classList.toggle('open');
    }
    const isOpen = dock.classList.contains('open');
    if(isOpen){ body.style.display='block'; header.setAttribute('aria-expanded','true'); if(!openOnce){ openOnce=true; init(); } }
    else { header.setAttribute('aria-expanded','false'); }
  }

  const DISMISS_KEY='collabDismissedV1';
  if(!localStorage.getItem(DISMISS_KEY)){
    setTimeout(()=>{ toggle(true); enterFullscreen(); }, 600);
  }
  // Launcher button for reopening after dismissal
  const launcher = document.createElement('button');
  launcher.className='collab-launcher';
  launcher.textContent='Editor';
  launcher.title='Open editor';
  launcher.addEventListener('click',()=>{ launcher.style.display='none'; toggle(true); enterFullscreen(); });
  document.body.appendChild(launcher);

  function enterFullscreen(){ dock.classList.add('fullscreen'); backdrop.classList.add('visible');
    const pop=document.getElementById('btnPop'); 
    if(pop) pop.style.display='none'; 
  }
  function exitFullscreen(){ dock.classList.remove('fullscreen'); backdrop.classList.remove('visible');
    const pop=document.getElementById('btnPop'); 
    if(pop) pop.style.display='inline-block'; 
  }
  backdrop.addEventListener('click', ()=>{ exitFullscreen(); });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape' && dock.classList.contains('fullscreen')) exitFullscreen(); });
  document.addEventListener('click', e=>{
    if(e.target && e.target.id==='btnPop'){ enterFullscreen(); }
    else if(e.target && e.target.id==='btnClose'){ dock.classList.remove('open'); exitFullscreen(); localStorage.setItem(DISMISS_KEY,'1'); launcher.style.display='inline-block'; }
  });

  async function init(){
    const statusEl = document.getElementById('collabStatus');
    const timeline=[]; function mark(stage, ok, err){ timeline.push({stage, ok, err: err? String(err): undefined}); }
    const DETAILS_ID='collabDiagDetails';
    function ensureDetails(){
      let d=document.getElementById(DETAILS_ID);
      if(!d){
        d=document.createElement('details'); d.id=DETAILS_ID; d.style.margin='6px 0';
        const sum=document.createElement('summary'); sum.textContent='Diagnostics';
        const pre=document.createElement('pre'); pre.style.fontSize='11px'; pre.style.maxHeight='140px'; pre.style.overflow='auto'; pre.id='collabDiagPre';
        d.appendChild(sum); d.appendChild(pre);
        dock.querySelector('.collab-dock-body').appendChild(d);
      }
      return d;
    }
    function updateDetails(){ const pre=document.getElementById('collabDiagPre'); if(pre){ pre.textContent=timeline.map(t=>`${t.stage}\t${t.ok?'OK':'FAIL'}${t.err?' -> '+t.err:''}`).join('\n'); } }
    function showFallback(){
      statusEl.textContent='Fallback';
      statusEl.style.background='#b45f06';
      const bodyEl = dock.querySelector('.collab-dock-body');
      if(!bodyEl.querySelector('.fallback-wrapper')){
        const wrap=document.createElement('div'); wrap.className='fallback-wrapper'; wrap.innerHTML=`<div class="fallback-msg">Real-time libraries failed to load. Using offline notes. <button id="collabRetry" class="retry-btn">Retry</button></div><textarea id="fallbackEditor" class="fallback-editor" placeholder="Offline notes (not shared)..."></textarea>`;
        bodyEl.insertBefore(wrap, bodyEl.firstChild);
        const ta = wrap.querySelector('#fallbackEditor');
        const LS_KEY='collabFallbackV1';
        ta.value=localStorage.getItem(LS_KEY)||'';
        ta.addEventListener('input',()=>{ localStorage.setItem(LS_KEY, ta.value); updateCharCount(ta.value.length); });
        updateCharCount(ta.value.length);
        wrap.querySelector('#collabRetry').addEventListener('click', ()=>{
          statusEl.textContent='Retry...';
          wrap.remove();
          const diag=document.getElementById(DETAILS_ID); if(diag) diag.remove();
          setTimeout(()=>init(), 50);
        });
      }
      console.group('Collab load diagnostics'); timeline.forEach(t=> console.log(t)); console.groupEnd();
      ensureDetails(); updateDetails();
    }

    async function tryLoad(label, fn){
      try { await fn(); mark(label, true); updateDetails(); return true; } catch(e){ mark(label, false, e); updateDetails(); return false; }
    }
    // Attempt sequence: CDN Yjs -> CDN Quill; on any failure attempt local copies; if still failure -> fallback
    ensureDetails();
    mark('start', true);
    updateDetails();
  // Attempt loading order now prefers internal served real dist first, then CDN, then placeholder vendor.
  // CDN attempts with timeout wrappers
    function withTimeout(promise, ms, name){ return Promise.race([
      promise,
      new Promise((_,rej)=> setTimeout(()=> rej(new Error('timeout '+name+' '+ms+'ms')), ms))
    ]); }

    // 1. Internal dist (served by server.js /vendor-dist/yjs.js)
    let haveY = !!window.Y;
    if(!haveY){
      const internalY = await tryLoad('internal:yjs', ()=> withTimeout(loadScript('/vendor-dist/yjs.js'), 3000, 'internal yjs'));
      haveY = !!window.Y; mark('check:yjs:internalWindow', haveY, haveY? undefined: (internalY? 'loaded script but window.Y missing':'load failed'));
      updateDetails();
    }
    // 2. CDN fallback
    if(!haveY){
      const cdnY = await tryLoad('cdn:yjs', ()=> withTimeout(loadScript('https://cdn.jsdelivr.net/npm/yjs@13.6.14/dist/yjs.js'), 5000, 'yjs'));
      haveY = !!window.Y; mark('check:yjs:cdnWindow', haveY, haveY? undefined: (cdnY? 'loaded but window.Y missing':'load failed'));
      updateDetails();
    }
    // 3. Legacy vendor placeholder path (will warn)
    if(!haveY){
      const localY = await tryLoad('fallback:vendor:yjs', ()=> withTimeout(loadScript('/vendor/yjs/yjs.js'), 2000, 'vendor yjs'));
      haveY = !!window.Y; mark('check:yjs:vendorWindow', haveY, haveY? undefined: (localY? 'loaded but window.Y missing':'load failed'));
      updateDetails();
    }
    updateDetails();
    if(!haveY){ showFallback(); return; }

    const cdnQuill = await tryLoad('cdn:quill:css', ()=> { loadStyle('https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.snow.css'); return Promise.resolve(); });
    const cdnQuillJS = await tryLoad('cdn:quill:js', ()=> withTimeout(loadScript('https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.min.js'), 5000, 'quill')); let haveQuill = !!window.Quill; mark('check:quill:window', haveQuill, haveQuill? undefined:'window.Quill missing'); updateDetails();
    if(!haveQuill){
      const localQuill = await tryLoad('local:quill:js', ()=> withTimeout(loadScript('/vendor/quill/quill.min.js'), 3000, 'local quill')); haveQuill = !!window.Quill; mark('check:quill:localWindow', haveQuill, haveQuill? undefined:'still missing'); updateDetails();
    }
    if(!haveQuill){ showFallback(); return; }

    mark('init:setup', true); updateDetails();
    try { await setup(); mark('init:setup:done', true); updateDetails(); }
    catch(e){ mark('init:setup:fail', false, e); updateDetails(); showFallback(); }
  }

  async function setup(){
    const statusEl = document.getElementById('collabStatus');
    const presenceList = document.getElementById('presenceList');
    const charCount = document.getElementById('charCount');
    // Seed origin badge placeholder
    let originBadge = document.getElementById('seedOriginBadge');
    if(!originBadge){
      originBadge = document.createElement('span');
      originBadge.id='seedOriginBadge';
      originBadge.style.cssText='margin-left:8px;font-size:11px;padding:2px 6px;border-radius:12px;background:#444;color:#eee;';
      const h4 = document.querySelector('#'+DOCK_ID+' h4');
      if(h4) h4.appendChild(originBadge);
    }

  // Yjs doc & raw WebSocket bridge
  const ydoc = new Y.Doc();
  const room = 'global-collab-v1';
  const wsUrl = (location.protocol==='https:'?'wss://':'ws://')+location.host+'/collab?room='+encodeURIComponent(room);
  const ws = new WebSocket(wsUrl);
  const ytext = ydoc.getText('quill');
  const ymeta = ydoc.getMap('meta');

  // Inject custom Word-like toolbar if empty
    const toolbarHost = document.getElementById('collabToolbar');
    if(toolbarHost && toolbarHost.children.length===0){
      toolbarHost.classList.add('word-toolbar');
      toolbarHost.innerHTML = `
        <span class="ql-formats">
          <select class="ql-font">
            <option value="">Sans Serif</option>
            <option value="calibri" selected>Calibri</option>
            <option value="arial">Arial</option>
            <option value="georgia">Georgia</option>
            <option value="times">Times New Roman</option>
            <option value="courier">Courier New</option>
            <option value="verdana">Verdana</option>
            <option value="tahoma">Tahoma</option>
            <option value="trebuchet">Trebuchet MS</option>
            <option value="palatino">Palatino</option>
            <option value="garamond">Garamond</option>
          </select>
          <select class="ql-size">
            <option value="8pt">8</option>
            <option value="9pt">9</option>
            <option value="10pt">10</option>
            <option value="11pt" selected>11</option>
            <option value="12pt">12</option>
            <option value="14pt">14</option>
            <option value="16pt">16</option>
            <option value="18pt">18</option>
            <option value="20pt">20</option>
            <option value="24pt">24</option>
            <option value="28pt">28</option>
            <option value="32pt">32</option>
            <option value="36pt">36</option>
            <option value="48pt">48</option>
            <option value="72pt">72</option>
          </select>
        </span>
        <span class="ql-formats">
          <select class="ql-header">
            <option selected value="0"></option>
            <option value="1"></option>
            <option value="2"></option>
            <option value="3"></option>
          </select>
          <button class="ql-bold"></button>
          <button class="ql-italic"></button>
          <button class="ql-underline"></button>
          <button class="ql-strike"></button>
        </span>
        <span class="ql-formats">
          <select class="ql-color"></select>
          <select class="ql-background"></select>
        </span>
        <span class="ql-formats">
          <button class="ql-list" value="ordered"></button>
          <button class="ql-list" value="bullet"></button>
          <button class="ql-indent" value="-1"></button>
          <button class="ql-indent" value="+1"></button>
        </span>
        <span class="ql-formats">
          <button class="ql-blockquote"></button>
          <button class="ql-code-block"></button>
          <select class="ql-align"></select>
        </span>
        <span class="ql-formats">
          <button class="ql-clean"></button>
        </span>`;
    }
    // Quill setup with custom toolbar selector
    const quill = new Quill('#collabEditor', { theme:'snow', placeholder:'Shared operational notes (real-time)...', modules:{ toolbar: '#collabToolbar' } });
    // Apply word-like page style
    const editorContainer = document.querySelector('#collabEditor');
    if(editorContainer){ editorContainer.classList.add('word-like'); }
    // Warn if placeholder libs are active
    if(window.Y && window.Y.Doc && String(window.Y.Doc).includes('Placeholder')){
      injectPlaceholderNotice('Yjs placeholder build active. Replace /vendor/yjs/yjs.js with real bundle.');
    }
    if(window.Quill && String(window.Quill).includes('Placeholder Quill')){
      injectPlaceholderNotice('Quill placeholder build active. Replace /vendor/quill/quill.min.js with real bundle.');
    }

    // Bind (simple binding manual approach)
    // Attempt to reconstruct Delta if present in meta (rich formatting)
    let appliedDelta=false;
    const storedRaw = ymeta.get('delta');
    if(storedRaw){
      try {
        const parsed = JSON.parse(storedRaw);
        if(parsed && Array.isArray(parsed.ops)){
          quill.setContents(parsed, 'silent');
          // Ensure plain text mirror is aligned
          const plain = quill.getText();
          if(!ytext.toString()){ ytext.insert(0, plain); }
          appliedDelta=true;
        }
      } catch(e){ console.warn('failed to apply stored delta', e); }
    }
    if(!appliedDelta){
      quill.setText(ytext.toString());
    }
    // If empty, fetch persisted text for visibility quickly
    if(!ytext.toString().trim()){
      try {
        const resp = await fetch('/api/collab/text');
        if(resp.ok){
          const data = await resp.json();
          if(data && data.text && !ytext.toString()){
            ytext.insert(0, data.text);
            quill.setText(data.text);
          }
        }
      } catch(e){ console.warn('populate from /api/collab/text failed', e); }
    }
    // Observe Y changes -> Quill
    ytext.observe(event => {
      const current = ytext.toString();
      if(current !== quill.getText()) {
        const sel = quill.getSelection();
        quill.setText(current); // naive full replace (ok for small doc). For production use y-quill binding.
        if(sel) quill.setSelection(sel.index, sel.length, 'silent');
      }
      updateMetrics();
    });
    // Quill -> Y text
    quill.on('text-change', ()=>{
      const val = quill.getText();
      if(val !== ytext.toString()){
        ytext.delete(0, ytext.length);
        ytext.insert(0, val);
      }
      // Persist Delta JSON into ymeta (string) for server debounce persistence
      try {
        const delta = quill.getContents();
        const raw = JSON.stringify(delta);
        if(ymeta.get('delta') !== raw){ ymeta.set('delta', raw); }
      } catch(e){ console.warn('delta serialize failed', e); }
      updateMetrics();
    });

  function updateMetrics(){ charCount.textContent = (ytext.length)+' chars'; }
    updateMetrics();

    // Simple local presence only (no multi-user awareness messages yet)
    function renderPresence(){
      presenceList.innerHTML='';
      const div=document.createElement('div');
      div.className='presence-chip';
      div.innerHTML='<span class="presence-dot"></span>You';
      presenceList.appendChild(div);
    }
    renderPresence();

    ws.binaryType = 'arraybuffer';
  ws.addEventListener('open', ()=>{ statusEl.textContent='Online'; statusEl.style.background='#2d862d'; });
  ws.addEventListener('close', ()=>{ if(statusEl.textContent==='Online'){ statusEl.textContent='Offline'; statusEl.style.background='#a61c00'; }});
  ws.addEventListener('error', ()=>{ statusEl.textContent='Error'; statusEl.style.background='#a61c00'; });
    ws.addEventListener('message', (ev)=>{
      try { const update = new Uint8Array(ev.data); Y.applyUpdate(ydoc, update); } catch(e){ console.error('apply update fail', e); }
    });
    // Broadcast local doc updates
    ydoc.on('update', update => { if(ws.readyState===1) ws.send(update); });

    // Export HTML (convert Quill Delta to HTML using Quill root innerHTML)
    document.getElementById('btnExportHTML').addEventListener('click', ()=>{
      const html = quill.root.innerHTML;
      const blob = new Blob([html], { type:'text/html' });
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='collab-notes.html'; a.click();
    });
    // Export DOCX via server endpoint
    const btnDocx = document.getElementById('btnExportDOCX');
    if(btnDocx){
      btnDocx.addEventListener('click', ()=>{
        btnDocx.disabled=true; const original=btnDocx.textContent; btnDocx.textContent='Preparing...';
        fetch('/api/export-docx').then(r=>{ if(!r.ok) throw new Error('export failed'); return r.blob(); })
          .then(blob=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='collab-notes.docx'; a.click(); })
          .catch(err=>{ console.error('DOCX export failed', err); alert('DOCX export failed'); })
          .finally(()=>{ btnDocx.disabled=false; btnDocx.textContent=original; });
      });
    }
    const wsTestBtn = document.getElementById('btnWsTest');
    if(wsTestBtn){
      wsTestBtn.addEventListener('click', ()=>{
        wsTestBtn.disabled=true; wsTestBtn.textContent='Testing...';
        const testWs = new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/collab?room=probe');
        let done=false;
        const finish=(ok)=>{ if(done) return; done=true; testWs.close(); wsTestBtn.disabled=false; wsTestBtn.textContent= ok? 'WS OK' : 'WS Fail'; setTimeout(()=> wsTestBtn.textContent='WS Test', 2500); };
        testWs.addEventListener('open', ()=> finish(true));
        testWs.addEventListener('error', ()=> finish(false));
        setTimeout(()=> finish(false), 3000);
      });
    }

    // Import document from URL
    const btnImportUrl = document.getElementById('btnImportUrl');
    const urlInput = document.getElementById('docUrlInput');
    if(btnImportUrl && urlInput){
      btnImportUrl.addEventListener('click', async ()=>{
        const url = urlInput.value.trim();
        if(!url) {
          alert('Please enter a document URL');
          return;
        }
        
        btnImportUrl.disabled = true;
        const originalText = btnImportUrl.textContent;
        btnImportUrl.textContent = 'Importing...';
        
        try {
          const response = await fetch('/api/import-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
          });
          
          if(!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Import failed');
          }
          
          const { html, messages } = await response.json();
          
          // Convert HTML to Delta and apply to editor
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = html;
          
          // Clear existing content and insert new content
          quill.setContents([]);
          quill.clipboard.dangerouslyPasteHTML(html);
          
          // Update Y.Map with new content
          const delta = quill.getContents();
          ymeta.set('delta', JSON.stringify(delta));
          
          // Show success message
          const successMsg = `Document imported successfully! ${messages.length > 0 ? `(${messages.length} conversion messages)` : ''}`;
          const statusEl = document.getElementById('collabStatus');
          if(statusEl) {
            const originalStatus = statusEl.textContent;
            statusEl.textContent = 'Imported';
            statusEl.style.background = '#28a745';
            setTimeout(() => {
              statusEl.textContent = originalStatus;
              statusEl.style.background = '';
            }, 3000);
          }
          
          // Clear the URL input
          urlInput.value = '';
          
        } catch(error) {
          console.error('URL import failed:', error);
          alert(`Import failed: ${error.message}`);
        } finally {
          btnImportUrl.disabled = false;
          btnImportUrl.textContent = originalText;
        }
      });
      
      // Allow Enter key to trigger import
      urlInput.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') {
          btnImportUrl.click();
        }
      });
    }

    // Fetch status for origin badge
    try {
      const sResp = await fetch('/api/collab/status');
      if(sResp.ok){
        const sData = await sResp.json();
        if(originBadge){
          if(sData.primaryDocx || sData.doubleDocx){
            originBadge.textContent = 'Seed: DOCX'; originBadge.style.background='#1d3557';
          } else {
            originBadge.textContent = 'Seed: TXT'; originBadge.style.background='#264653';
          }
        }
      } else if(originBadge){ originBadge.textContent='Seed:?'; }
    } catch(e){ if(originBadge){ originBadge.textContent='Seed:?'; } }
  }

  function updateCharCount(len){ const el=document.getElementById('charCount'); if(el) el.textContent=len+' chars'; }
  function injectPlaceholderNotice(msg){
    const wrap = document.createElement('div');
    wrap.className='quill-placeholder-warning';
    wrap.textContent=msg;
    const editorWrap = document.querySelector('.collab-editor-wrap');
    if(editorWrap) editorWrap.insertBefore(wrap, editorWrap.firstChild);
  }
})();