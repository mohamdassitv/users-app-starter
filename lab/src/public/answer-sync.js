// Candidate autosave & session bootstrap (inline-only images)
(function(){
  const INDICATOR_ID='syncIndicator';
  const DEBOUNCE_MS=1200;
  // Try candidateSlug first (set by login), then fall back to examSessionId
  let sessionId=localStorage.getItem('candidateSlug')||localStorage.getItem('examSessionId')||null;
  let email=localStorage.getItem('candidateEmail')||null;
  let candidateName=localStorage.getItem('candidateName')||null;
  let timers={};
  let viewerMode=false; // admin read-only view

  function ensureIndicator(){
    let el=document.getElementById(INDICATOR_ID);
    if(!el){
      el=document.createElement('div');
      el.id=INDICATOR_ID;
      el.style.cssText='position:fixed;bottom:10px;right:14px;background:#132033;color:#cbd5e1;font-size:11px;padding:6px 10px;border-radius:10px;border:1px solid #1f2d3d;z-index:5000;font-family:ui-monospace,monospace;box-shadow:0 4px 12px -4px rgba(0,0,0,.4);';
      el.textContent='Idle';
      document.body.appendChild(el);
    }
    return el;
  }
  function setStatus(msg,color){ const el=ensureIndicator(); el.textContent=msg; el.style.background=color||'#132033'; }

  async function createSession(){
    if(!email) return;
    // First check if we already have a slug from localStorage
    const existingSlug = localStorage.getItem('candidateSlug');
    if(existingSlug) {
      sessionId = existingSlug;
      setStatus('Session '+sessionId.slice(0,8),'#0f766e');
      return;
    }
    try {
      const r=await fetch('/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidate_name:candidateName,email})});
      if(!r.ok){ setStatus('Session fail','crimson'); return; }
      const j=await r.json();
      sessionId=j.session.id; 
      localStorage.setItem('examSessionId',sessionId);
      localStorage.setItem('candidateSlug',sessionId); // Also store as candidateSlug for consistency
      setStatus('Session '+sessionId.slice(0,8),'#0f766e');
    }catch(e){ setStatus('Net err','crimson'); }
  }

  async function init(){
    if(!email && document.cookie.includes('admin=1')){ viewerMode=true; await resolveCandidateForViewer(); }
    // If candidate has candidateSlug cookie but localStorage was cleared, resolve it
    if(!email && document.cookie.includes('candidateSlug=')){ await resolveCandidateFromSlugCookie(); }
    if(!email){ setStatus('No candidate email'); return; }
    if(!sessionId){ await createSession(); }
    await hydrateExisting();
    if(!viewerMode){
      attachAutosave();
      window.addEventListener('beforeunload', flushAll);
    } else {
      [...document.querySelectorAll('[data-task-id]')].forEach(el=>{ el.disabled=true; el.style.opacity='0.9'; });
      setStatus('Viewer (live)',' #0f766e');
    }
    openRealtime();
  }

  async function resolveCandidateForViewer(){
    try {
      const slug=(document.cookie.match(/candidateSlug=([^;]+)/)||[])[1] || extractSlugFromLocation();
      if(!slug){ setStatus('No slug'); return; }
      const r=await fetch('/api/admin/slug/'+encodeURIComponent(slug)+'/info',{cache:'no-store'});
      if(!r.ok){ setStatus('Slug lookup failed'); return; }
      const j=await r.json();
      email=j.email; candidateName=j.email;
      localStorage.setItem('candidateEmail',email);
      localStorage.setItem('candidateName',candidateName);
    }catch(e){ setStatus('Viewer resolve error','crimson'); }
  }

  // Resolve candidate email when they have candidateSlug cookie but localStorage was cleared
  async function resolveCandidateFromSlugCookie(){
    try {
      const slug=(document.cookie.match(/candidateSlug=([^;]+)/)||[])[1];
      if(!slug){ console.log('[answer-sync] No candidateSlug cookie found'); return; }
      console.log('[answer-sync] Resolving candidate from slug cookie:', slug);
      const r=await fetch('/public/slug/'+encodeURIComponent(slug)+'/info',{cache:'no-store'});
      if(!r.ok){ 
        console.log('[answer-sync] Slug lookup failed, status:', r.status);
        setStatus('Session lookup failed'); 
        return; 
      }
      const j=await r.json();
      if(j.email){
        email=j.email; 
        candidateName=j.email;
        sessionId=slug;
        localStorage.setItem('candidateEmail',email);
        localStorage.setItem('candidateName',candidateName);
        localStorage.setItem('candidateSlug',slug);
        console.log('[answer-sync] Resolved candidate email:', email);
      }
    }catch(e){ console.error('[answer-sync] Resolve error:', e); setStatus('Session error','crimson'); }
  }

  function extractSlugFromLocation(){
    const p=location.pathname;
    const m=p.match(/^\/c\/([^\/]+)/); if(m) return m[1];
    const g=p.match(/^\/generated\/([^\/]+)/); if(g) return g[1];
    return null;
  }

  async function hydrateExisting(){
    if(!sessionId) return;
    try {
      const r=await fetch('/api/sessions/'+encodeURIComponent(sessionId)+'/answers',{cache:'no-store'});
      if(!r.ok) return;
      const j=await r.json();
      (j.answers||[]).forEach(row=>{ const {task_id,content}=row; if(content && typeof content==='object') applyContent(task_id,content); });
      setStatus(viewerMode? 'Viewer hydrated':'Hydrated','#065f46');
    }catch(e){ /* ignore */ }
  }

  function collectTaskPayload(taskId){
    const els=[...document.querySelectorAll('[data-task-id="'+CSS.escape(taskId)+'"]')];
    const payload={};
    els.forEach(el=>{
      const key=el.getAttribute('name')||el.id||'value';
      if(el.isContentEditable){ payload[key]=sanitizeHtml(el.innerHTML); }
      else payload[key]=el.value;
    });
    const editor=document.querySelector('.inline-editor[data-task-id="'+CSS.escape(taskId)+'"]');
    if(editor){
      const imgs=[...editor.querySelectorAll('img[src]')];
      if(imgs.length){ payload.imagesMeta=JSON.stringify(imgs.map(im=>({url:im.getAttribute('src'),filename:im.getAttribute('alt')||'inline',ts:Date.now()}))); }
    }
    return payload;
  }

  function scheduleSave(taskId){
    clearTimeout(timers[taskId]);
    timers[taskId]=setTimeout(()=> saveTask(taskId), DEBOUNCE_MS);
    setStatus('Saving…','#334155');
  }

  async function saveTask(taskId){
    if(!sessionId) return;
    const content=collectTaskPayload(taskId);
    try {
      const r=await fetch('/api/sessions/'+encodeURIComponent(sessionId)+'/answers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task_id:taskId,content})});
      if(!r.ok){ setStatus('Failed','crimson'); return; }
      const j=await r.json();
      setStatus('Saved v'+(j.answer&&j.answer.version),'#065f46');
    }catch(e){ setStatus('Error','crimson'); }
  }

  function attachAutosave(){
    const inputs=[...document.querySelectorAll('textarea[data-task-id],input[type=text][data-task-id],.inline-editor[data-task-id]')];
    inputs.forEach(el=>{
      const t=el.getAttribute('data-task-id');
      const handler=()=>{ if(el.dataset.remoteUpdating==='1') return; scheduleSave(t); };
      el.addEventListener('input',handler);
      if(el.isContentEditable){
        el.addEventListener('keyup',handler);
        el.addEventListener('paste',e=> handleEditorPaste(e,el,t));
        el.addEventListener('drop',e=> handleEditorDrop(e,el,t));
        el.addEventListener('dragover',e=>{ e.preventDefault(); el.classList.add('drag-hover'); });
        el.addEventListener('dragleave',()=> el.classList.remove('drag-hover'));
        ensurePlaceholder(el);
      }
    });
  }

  function flushAll(){
    if(!sessionId) return;
    Object.keys(timers).forEach(k=> clearTimeout(timers[k]));
    const tasks=new Set([...document.querySelectorAll('[data-task-id]')].map(el=> el.getAttribute('data-task-id')));
    tasks.forEach(taskId=>{
      const content=collectTaskPayload(taskId);
      const blob=new Blob([JSON.stringify({task_id:taskId,content})],{type:'application/json'});
      navigator.sendBeacon('/api/sessions/'+encodeURIComponent(sessionId)+'/answers', blob);
    });
  }

  function openRealtime(){
    if(!sessionId) return;
    try {
      const es=new EventSource('/api/sessions/'+encodeURIComponent(sessionId)+'/stream');
      es.addEventListener('answer_updated', ev=>{
        try { const data=JSON.parse(ev.data||'{}'); if(data.task_id && data.content) { applyContent(data.task_id,data.content); setStatus((viewerMode?'Viewer':'Live')+' v'+(data.version||'?'),'#0f766e'); } }catch(_e){}
      });
    }catch(e){ /* ignore */ }
  }

  function applyContent(taskId, content){
    const els=[...document.querySelectorAll('[data-task-id="'+CSS.escape(taskId)+'"]')];
    els.forEach(el=>{
      Object.entries(content).forEach(([key,val])=>{
        const name=el.getAttribute('name')||el.id||'value';
        if(name===key){
          if(el.isContentEditable){
            if(el.innerHTML!==String(val)){
              el.dataset.remoteUpdating='1';
              el.innerHTML=String(val);
              setTimeout(()=> delete el.dataset.remoteUpdating,50);
              ensurePlaceholder(el);
            }
          } else if(typeof el.value==='string' && el.value!==String(val)){
            el.dataset.remoteUpdating='1'; el.value=String(val); setTimeout(()=> delete el.dataset.remoteUpdating,50);
          }
        }
      });
    });
    // imagesMeta: already represented by inline <img> tags
  }

  // Inline image handling
  function handleFiles(taskId, fileList){
    if(viewerMode) return;
    [...fileList].filter(f=> f.type && f.type.startsWith('image/')).slice(0,3).forEach(f=> uploadScreenshot(taskId,f));
  }

  async function uploadScreenshot(taskId, file){
    if(!sessionId) return;
    if(file.size > 4*1024*1024){ setStatus('Image too large','crimson'); return; }
    setStatus('Uploading…','#334155');
    try {
      const fd=new FormData(); fd.append('image',file); fd.append('task_id',taskId);
      const r=await fetch('/api/sessions/'+encodeURIComponent(sessionId)+'/assets',{method:'POST',body:fd});
      if(!r.ok){ setStatus('Upload failed','crimson'); return; }
      const j=await r.json();
      const editor=document.querySelector('.inline-editor[data-task-id="'+CSS.escape(taskId)+'"]');
      if(editor && editor.isContentEditable){
        insertImageAtCaret(editor,j.image.url,j.image.filename);
        scheduleSave(taskId);
      }
      setStatus('Image saved','#065f46');
    }catch(e){ setStatus('Net err','crimson'); }
  }

  function insertImageAtCaret(editor,url,filename){
    const img=document.createElement('img');
    img.src=url; img.alt=filename; img.style.maxWidth='100%'; img.style.border='1px solid #6ee7b7'; img.style.borderRadius='8px'; img.style.margin='4px 6px'; img.style.display='inline-block'; img.style.verticalAlign='middle';
    const sel=window.getSelection();
    if(sel && sel.rangeCount){
      const range=sel.getRangeAt(0); range.insertNode(img); range.setStartAfter(img); range.setEndAfter(img); sel.removeAllRanges(); sel.addRange(range);
    } else editor.appendChild(img);
    ensurePlaceholder(editor);
  }

  function handleEditorPaste(e,el,taskId){
    const items=e.clipboardData && e.clipboardData.items; if(!items) return;
    const files=[]; for(const it of items){ if(it.type && it.type.startsWith('image/')){ const f=it.getAsFile(); if(f) files.push(f); } }
    if(files.length){ e.preventDefault(); files.slice(0,3).forEach(f=> uploadScreenshot(taskId,f)); }
  }
  function handleEditorDrop(e,el,taskId){
    if(!e.dataTransfer) return; const files=[...e.dataTransfer.files].filter(f=> f.type.startsWith('image/')).slice(0,3);
    if(files.length){ e.preventDefault(); files.forEach(f=> uploadScreenshot(taskId,f)); }
  }

  function ensurePlaceholder(el){
    if(!el.isContentEditable) return;
    const ph=el.getAttribute('data-placeholder')||''; if(!ph) return;
    if(el.textContent.trim()==='' && !el.querySelector('img')){
      if(!el.__phActive){
        el.__phActive=true; el.classList.add('editor-empty'); el.style.position='relative';
        if(!el.querySelector('.inline-ph')){ const span=document.createElement('span'); span.textContent=ph; span.className='inline-ph'; span.style.cssText='pointer-events:none;position:absolute;left:16px;top:12px;opacity:.45;font-style:italic;color:#065f46;'; el.appendChild(span); }
      }
    } else if(el.__phActive){
      el.__phActive=false; el.classList.remove('editor-empty'); const phSpan=el.querySelector('.inline-ph'); if(phSpan) phSpan.remove();
    }
  }
  setInterval(()=> document.querySelectorAll('.inline-editor[data-task-id]').forEach(ensurePlaceholder),1500);

  // Sanitizer
  function sanitizeHtml(html){
    if(!html) return '';
    let out='';
    try {
      const doc=new DOMParser().parseFromString('<div>'+html+'</div>','text/html');
      const root=doc.body.firstChild; const allowed=new Set(['DIV','P','BR','STRONG','EM','CODE','SPAN','IMG']);
      (function walk(node){ node.childNodes.forEach(ch=>{
        if(ch.nodeType===Node.TEXT_NODE){ out+=escapeEntities(ch.textContent); return; }
        if(ch.nodeType===Node.ELEMENT_NODE){
          if(!allowed.has(ch.tagName)){ walk(ch); return; }
          if(ch.tagName==='BR'){ out+='<br>'; return; }
          if(ch.tagName==='IMG'){ const src=ch.getAttribute('src')||''; if(!src.startsWith('/session-assets/')) return; const alt=escapeEntities(ch.getAttribute('alt')||''); out+='<img src="'+src+'" alt="'+alt+'" style="max-width:100%;border:1px solid #6ee7b7;border-radius:8px;margin:4px 6px;display:inline-block;vertical-align:middle;" />'; return; }
          const tag=ch.tagName.toLowerCase(); out+='<'+tag+'>'; walk(ch); out+='</'+tag+'>';
        }
      }); })(root);
    }catch(_e){ return ''; }
    return out;
  }
  function escapeEntities(str){ return str.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

  setTimeout(init,200);
})();
