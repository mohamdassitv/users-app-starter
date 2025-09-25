// Minimal fullscreen arrow dock (shared across all pages)
(function() {
  // Increment this when making breaking UI changes to help with cache busting in HTML (?v=2 etc.)
  const SCRIPT_VERSION = '3';
  const DOCK_ID = 'collabDock';
  const LOCAL_DELTA_KEY = 'dockEditorDelta_v1';
  const LOCAL_HTML_KEY = 'dockEditorHTML_v1';
  const SUBMIT_FLAG_KEY = 'dockEditorSubmitted_v1';
  let isOpen = false;
  let quill = null;
  let ck = null; // CKEditor instance if used
  let reactEditor = null; // React-based editor wrapper (mount result)
  let initializedEditor = false;
  let submitting = false;
  let wordLookApplied = false;
  let ribbonInitialized = false;

  // Fallback template if DOCX template endpoint unavailable
  const FALLBACK_TEMPLATE = '<h1>Exam Worksheet</h1><p>(Template service unavailable; start documenting here.)</p>';
  // Richer immediate fallback (full section outline) so user always sees structure instantly
  const DETAILED_FALLBACK = `
  <h1 style="text-align:center;margin-top:0">Exam Worksheet (Offline Template)</h1>
  <p style="text-align:center;font-size:12px;color:#666;margin-top:4px">(Loaded local fallback — will auto-replace with official DOCX template if available)</p>
  <hr>
  <h2>1. Case Study – Branch Performance (Osaka)</h2>
  <p><strong>Topology Diagram / Path:</strong></p>
  <p><strong>Failure Domain Analysis:</strong></p>
  <ul><li>Access Circuit</li><li>CPE Resource</li><li>Overlay Path</li><li>Gateway Saturation</li><li>Cloud Egress</li><li>DNS</li><li>MTU</li><li>Jitter / Loss</li></ul>
  <p><strong>Observations / Metrics:</strong></p>
  <p><strong>Next-Step Recommendation:</strong></p>
  <hr>
  <h2>2. HTTP Gateway Evidence (ALRT-24117)</h2>
  <p><strong>Status Codes & Tokens:</strong></p>
  <p><strong>Latency Measurements:</strong></p>
  <p><strong>Trace / Correlation:</strong></p>
  <p><strong>Interpretation:</strong></p>
  <hr>
  <h2>3. High-Volume User Cleanup</h2>
  <p><strong>Initial Totals:</strong></p>
  <p><strong>Remediation Actions:</strong></p>
  <p><strong>Validation:</strong></p>
  <hr>
  <h2>4. IAM – Unlock Logs</h2>
  <p><strong>Role Grant Steps:</strong></p>
  <p><strong>ERROR Count:</strong> ____</p>
  <hr>
  <h2>5. Regex Task</h2>
  <p><strong>Final Pattern:</strong></p>
  <p><strong>Explanation:</strong></p>
  <hr>
  <h2>6. Automation Health Script</h2>
  <p><strong>Results JSON:</strong></p>
  <p><strong>Collection Method:</strong></p>
  <hr>
  <h2>7. Incident Update Draft</h2>
  <p><strong>Customer Update:</strong></p>
  <hr>
  <h2>8. NAT & Routing</h2>
  <p><strong>NAT Egress IP + Rationale:</strong></p>
  <hr>
  <h2>9. Policy & Rollback</h2>
  <p><strong>Deny Rule Applied:</strong></p>
  <p><strong>Verification:</strong></p>
  <p><strong>Rollback Plan:</strong></p>
  <hr>
  <h2>10. Additional Notes</h2>
  <p></p>
  <p style="margin-top:30px;font-size:11px;color:#777">(Reset Template will refetch official DOCX if server becomes available.)</p>`;

  async function fetchTemplate(){
    try {
      const r = await fetch('/api/dock-doc/template');
      if(!r.ok) return FALLBACK_TEMPLATE;
      const j = await r.json();
      return (j && j.html) ? j.html : FALLBACK_TEMPLATE;
    } catch(e){ return FALLBACK_TEMPLATE; }
  }

  function ensureAssets(cb){
  // Priority chain:
  // 1. React bundle (vendor/react-editor/react-editor.js) if present
  // 2. Local self-hosted CKEditor (vendor/ckeditor/ckeditor.js)
  // 3. Nested custom builds (dna-master, ckeditor5-react-master, etc.)
  // 4. CDN CKEditor
  // 5. CDN Quill
  // 6. Fallback contentEditable

    function loadReactBundle(){
      const sc = document.createElement('script');
      sc.src='/vendor/react-editor/react-editor.js';
      sc.onload=()=>{
        if(window.__mountDockReactEditor){
          console.info('[editor] Loaded React editor bundle');
          cb(false,'react');
        } else {
          console.warn('React editor bundle loaded but mount function missing, continuing to classic builds');
          loadLocalCK();
        }
      };
      sc.onerror=()=>{ loadLocalCK(); };
      document.head.appendChild(sc);
    }

    function loadLocalCK(){
      if(window.ClassicEditor){ return cb(false,'ck'); }
      const primary = document.createElement('script');
      primary.src='/vendor/ckeditor/ckeditor.js';
      let attemptedNested = false;
      function tryNestedGroup(){
        if(attemptedNested) return loadCdnCK();
        attemptedNested = true;
        const nestedPaths = [
          '/vendor/ckeditor/ckeditor5-build-classic-dna-master/build/ckeditor.js',
          '/vendor/ckeditor5-react-master/build/ckeditor.js',
          '/vendor/ckeditor/ckeditor5-react-master/build/ckeditor.js'
        ];
        function tryNext(i){
          if(window.ClassicEditor){ return cb(false,'ck'); }
            if(i>=nestedPaths.length){
              console.warn('All nested CKEditor build paths failed – falling back to CDN.');
              return loadCdnCK();
            }
            const nested = document.createElement('script');
            nested.src = nestedPaths[i];
            nested.onload=()=>{
              if(window.ClassicEditor){
                console.info('[editor] Loaded nested CKEditor build:', nested.src);
                cb(false,'ck');
              } else {
                console.warn('Nested path loaded but ClassicEditor undefined, trying next path.');
                tryNext(i+1);
              }
            };
            nested.onerror=()=>{
              console.warn('Nested CKEditor build path not found:', nested.src);
              tryNext(i+1);
            };
            document.head.appendChild(nested);
        }
        tryNext(0);
      }
      primary.onload=()=>{
        if(window.ClassicEditor){
          cb(false,'ck');
        } else {
          console.warn('Root ckeditor.js loaded but ClassicEditor undefined – attempting nested build paths...');
          tryNestedGroup();
        }
      };
      primary.onerror=()=>{
        console.warn('Root ckeditor.js not found – attempting nested build paths.');
        tryNestedGroup();
      };
      document.head.appendChild(primary);
    }
    function loadCdnCK(){
      if(window.ClassicEditor){ return cb(false,'ck'); }
      const sc=document.createElement('script');
      sc.src='https://cdn.ckeditor.com/ckeditor5/41.2.1/classic/ckeditor.js';
      sc.onload=()=>cb(false,'ck');
      sc.onerror=()=>{ console.warn('CDN CKEditor failed, moving to Quill'); loadQuill(); };
      document.head.appendChild(sc);
    }
    function loadQuill(){
      // Use CDN Quill for now (could add local later)
      if(!document.querySelector('link[data-quill]')){
        const link = document.createElement('link');
        link.rel='stylesheet';
        link.href='https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.snow.css';
        link.setAttribute('data-quill','css');
        document.head.appendChild(link);
      }
      if(window.Quill){ return cb(false,'quill'); }
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.min.js';
      s.async=true;
      s.onload=()=>cb(false,'quill');
      s.onerror=()=>{ console.warn('Quill load failed; using contentEditable fallback.'); cb(true,'fallback'); };
      document.head.appendChild(s);
    }
    loadReactBundle();
  }

  function createDock() {
    if (document.getElementById(DOCK_ID)) return document.getElementById(DOCK_ID);
    const dock = document.createElement('div');
    dock.id = DOCK_ID;
    dock.className = 'collab-dock closed';
    dock.setAttribute('aria-hidden', 'true');
    dock.innerHTML = `
      <div class="collab-dock-tab" role="button" aria-label="Open panel" tabindex="0">
        <span class="collab-dock-arrow" aria-hidden="true">▲</span>
      </div>
      <div class="collab-dock-panel" role="dialog" aria-modal="true">
        <div class="collab-dock-body" id="dockEditorBody">
          <div id="dockEditorHeader" class="word-toolbar" style="display:none"></div>
          <div id="dockEditor" class="quill word-like" aria-label="Document editor"></div>
          <div class="dock-editor-actions" id="dockEditorActions" style="display:none">
            <button id="dockBtnSubmit" class="btn-primary" type="button">Submit Document</button>
            <span id="dockStatus" class="muted" style="margin-left:12px;font-size:12px;">Draft (autosaved)</span>
            <span id="dockMode" class="muted" style="margin-left:12px;font-size:11px;padding:2px 6px;border-radius:4px;background:#eef2f7;border:1px solid #d5dae0;display:none"></span>
            <span id="dockWordStats" class="muted" style="margin-left:auto;font-size:12px;display:none">Words: 0 | Chars: 0</span>
          </div>
        </div>
      </div>`;
    document.body.appendChild(dock);
    const tab = dock.querySelector('.collab-dock-tab');
    tab.addEventListener('click', toggleDock);
    tab.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleDock(); } });
    return dock;
  }

  function initEditor(){
    if(initializedEditor) return;
    initializedEditor = true;
  const headerEl = document.getElementById('dockEditorHeader'); // placeholder (not used as container now)
  const editorEl = document.getElementById('dockEditor');
  const actionsEl = document.getElementById('dockEditorActions');
  if(!editorEl) return;
    // Proactive guidance: if user dropped ckeditor5-react-master source (no build) show hint once.
    try {
      // Lightweight HEAD request to see if build exists (will 404 fast). Not critical if blocked.
      fetch('/vendor/ckeditor5-react-master/build/ckeditor.js', { method:'HEAD' }).then(r=>{
        if(!r.ok){
          // Only show if folder marker file likely exists (heuristic: README.md)
          fetch('/vendor/ckeditor5-react-master/README.md',{method:'HEAD'}).then(r2=>{
            if(r2.ok){
              const existing = document.getElementById('ckReactSourceNotice');
              if(existing) return;
              const note = document.createElement('div');
              note.id='ckReactSourceNotice';
              note.innerHTML = '<strong>CKEditor React source detected</strong> – No build/ckeditor.js found. Build a classic bundle and place it at <code>/vendor/ckeditor5-react-master/build/ckeditor.js</code> (or place any custom build in /vendor/ckeditor/ckeditor.js). The app will then auto-use it.';
              note.style.cssText='background:#e0f2fe;border:1px solid #7dd3fc;padding:8px 10px;font-size:12px;border-radius:6px;margin:0 0 10px;color:#0c4a6e;';
              const body = document.getElementById('dockEditorBody');
              if(body) body.insertBefore(note, body.firstChild.nextSibling);
            }
          }).catch(()=>{});
        }
      }).catch(()=>{});
    } catch(_e){ }
    ensureAssets((fallback, mode)=>{
      const modeBadge = document.getElementById('dockMode');
      function setModeBadge(label,color){
        if(!modeBadge) return; modeBadge.style.display='inline-block'; modeBadge.textContent=label; modeBadge.style.background=color||'#eef2f7';
      }
      const submittedAlready = localStorage.getItem(SUBMIT_FLAG_KEY)==='1';
  if(!fallback && mode==='react' && window.__mountDockReactEditor){
        setModeBadge('React CKEditor','linear-gradient(90deg,#e0f7ff,#f0fff4)');
        const existingHtml = localStorage.getItem(LOCAL_HTML_KEY);
        const initialPromise = existingHtml ? Promise.resolve(existingHtml) : fetchTemplate();
        ensureWordLook(editorEl);
        const host = editorEl.querySelector('.word-page-content');
        host.innerHTML = '<div id="reactEditorHost" style="min-height:600px"></div>';
        buildRibbon('react');
        initialPromise.then(tpl=>{
          const startHtml = existingHtml || tpl;
          window.__mountDockReactEditor({
            host: document.getElementById('reactEditorHost'),
            initialHTML: existingHtml || DETAILED_FALLBACK,
            onContent: html => {
              if(submitting) return;
              try { localStorage.setItem(LOCAL_HTML_KEY, html); } catch(_){ }
              const stEl = document.getElementById('dockStatus');
              if(stEl && !submittedAlready) stEl.textContent='Draft saved '+ new Date().toLocaleTimeString();
              updateWordStats();
            },
            readOnly: submittedAlready
          }).then(instance=>{
            reactEditor = instance;
            if(!existingHtml && /Offline Template/.test(reactEditor.getData())){
              // Replace fallback with official
              setTimeout(()=>{
                // No direct API to set data via wrapper; fallback to DOM replacement (simplistic)
                // If using Classic build, command execution would be ideal; here we trust initial load.
              },100);
            }
            updateWordStats();
          }).catch(err=>{
            console.warn('React editor mount failed; falling back to classic chain', err);
            // Force classic path
            ensureAssets(()=>{},'ck');
          });
        });
      }
  else if(!fallback && mode==='ck' && window.ClassicEditor){
    setModeBadge('Classic CKEditor','#e8f5ff');
        // CKEditor path (primary)
        const existingHtml = localStorage.getItem(LOCAL_HTML_KEY);
        const initialPromise = existingHtml ? Promise.resolve(existingHtml) : fetchTemplate();
        initialPromise.then(tpl=>{
          const startHtml = existingHtml || tpl;
          ensureWordLook(editorEl);
          const host = editorEl.querySelector('.word-page-content');
          host.innerHTML = '<div id="ckEditorHost">'+ (existingHtml ? existingHtml : DETAILED_FALLBACK) +'</div>';
          // Delay actual official template injection until after potential replacement
          window.ClassicEditor.create(editorEl.querySelector('#ckEditorHost'), {
            toolbar: { items: [] }, // hide default, we'll supply our custom ribbon
            placeholder: 'Start documenting...'
          }).then(instance=>{
            ck = instance;
            if(!existingHtml){
              // Replace fallback outline with official template only if offline placeholder still present
              if(/Offline Template/.test(ck.getData())){
                ck.setData(startHtml);
              }
              try { localStorage.setItem(LOCAL_HTML_KEY, ck.getData()); } catch(_){ }
            }
            buildRibbon('ck');
            ck.model.document.on('change:data', ()=>{
              if(submitting) return;
              try { localStorage.setItem(LOCAL_HTML_KEY, ck.getData()); } catch(_){ }
              // We don't maintain a delta for CKEditor; clear delta key so Quill path isn't confused
              localStorage.removeItem(LOCAL_DELTA_KEY);
              const stEl = document.getElementById('dockStatus');
              if(stEl && !submittedAlready) stEl.textContent='Draft saved '+ new Date().toLocaleTimeString();
              updateWordStats();
            });
            if(submittedAlready){ disableEditing(); }
            updateWordStats();
          }).catch(err=>{
            console.warn('CKEditor init failed, falling back to Quill', err);
            // Force Quill path
            initQuillPath(submittedAlready, editorEl, headerEl);
          });
        });
      } else if(!fallback && mode==='quill' && window.Quill){
        setModeBadge('Quill','#f5f0ff');
        initQuillPath(submittedAlready, editorEl, headerEl);
      } else {
        setModeBadge('Fallback','#fff4e5');
        if(mode==='ck' && !window.ClassicEditor){
          // Show offline notice for missing CKEditor
          const note = document.createElement('div');
          note.className='editor-fallback-note';
          note.textContent='Rich editor not available (CKEditor build not found). Using fallback.';
          note.style.cssText='background:#fff3cd;border:1px solid #f6d98b;padding:6px 10px;font-size:12px;border-radius:6px;margin:0 0 10px;color:#6b5300;';
          const body = document.getElementById('dockEditorBody');
          body && body.insertBefore(note, body.firstChild.nextSibling);
        }
        const toolbarOptions = [
          [{ font: [] }, { size: [] }],
          ['bold','italic','underline','strike'],
          [{ color: [] }, { background: [] }],
          [{ script: 'sub'}, { script: 'super' }],
          [{ header: 1 }, { header: 2 }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ indent: '-1' }, { indent: '+1' }],
          [{ align: [] }],
          ['blockquote','code-block'],
          ['clean']
        ];
        // ContentEditable fallback (neither CKEditor nor Quill loaded)
        // Fallback plain contenteditable
        ensureWordLook(editorEl);
        const host = editorEl.querySelector('.word-page-content');
        const existing = localStorage.getItem(LOCAL_HTML_KEY);
        if(existing){
          host.innerHTML = '<div contenteditable="true" class="fallback-area">'+ existing +'</div>';
        } else {
          host.innerHTML = '<div contenteditable="true" class="fallback-area">'+ DETAILED_FALLBACK +'</div>';
          fetchTemplate().then(tpl=>{
            const area = host.querySelector('.fallback-area');
            if(area && /Offline Template/.test(area.innerHTML)){
              area.innerHTML = tpl;
            }
            try { localStorage.setItem(LOCAL_HTML_KEY, area.innerHTML); } catch(_){}
          });
        }
        editorEl.dataset.fallback='1';
        editorEl.addEventListener('input', ()=>{
          const area = host.querySelector('.fallback-area');
          const html = area ? area.innerHTML : '';
          localStorage.setItem(LOCAL_HTML_KEY, html);
          const stEl = document.getElementById('dockStatus');
          if(stEl) stEl.textContent = 'Draft saved '+ new Date().toLocaleTimeString();
          updateWordStats();
        });
        buildRibbon(mode==='react'?'react':'fallback');
        updateWordStats();
      }
      // Actions
      actionsEl.style.display='flex';
      const submitBtn = document.getElementById('dockBtnSubmit');
      // Inject reset template button (only once)
      let resetBtn = document.getElementById('dockBtnReset');
      if(!resetBtn){
        resetBtn = document.createElement('button');
        resetBtn.id='dockBtnReset';
        resetBtn.type='button';
        resetBtn.textContent='Reset Template';
        resetBtn.className='btn-secondary';
        resetBtn.style.marginLeft='8px';
        submitBtn && submitBtn.insertAdjacentElement('afterend', resetBtn);
        // Add export button (download HTML) for convenience
        const exportBtn = document.createElement('button');
        exportBtn.id='dockBtnExport';
        exportBtn.type='button';
        exportBtn.textContent='Download HTML';
        exportBtn.className='btn-secondary';
        exportBtn.style.marginLeft='8px';
        submitBtn && submitBtn.insertAdjacentElement('afterend', exportBtn);
        exportBtn.addEventListener('click', ()=>{
          if(localStorage.getItem(SUBMIT_FLAG_KEY)!=='1'){
            const html = getCurrentHTML();
            const blob = new Blob([html], { type:'text/html' });
            const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='exam-notes.html'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
          }
        });
      }
      const statusEl = document.getElementById('dockStatus');
      if(submittedAlready){
        submitBtn.disabled = true;
        if(resetBtn) resetBtn.disabled = true;
        if(statusEl) statusEl.textContent='Previously submitted';
        disableEditing();
      }
      submitBtn.addEventListener('click', submitDocument);
      if(resetBtn){
        resetBtn.addEventListener('click', ()=>{
          if(submitting) return;
          if(localStorage.getItem(SUBMIT_FLAG_KEY)==='1') return; // safety
          if(!confirm('Reset document to base exam template from DOCX? This will replace current draft.')) return;
          try {
            // Clear stored draft
            localStorage.removeItem(LOCAL_DELTA_KEY);
            localStorage.removeItem(LOCAL_HTML_KEY);
            fetchTemplate().then(tpl=>{
              if(ck){
                ck.setData(tpl); try { localStorage.setItem(LOCAL_HTML_KEY, ck.getData()); } catch(_){ }
                ck.editing.view.focus();
              } else if(quill){
                quill.setContents([]); quill.clipboard.dangerouslyPasteHTML(tpl);
                localStorage.setItem(LOCAL_HTML_KEY, quill.root.innerHTML);
                localStorage.setItem(LOCAL_DELTA_KEY, JSON.stringify(quill.getContents()));
                quill.focus();
              } else {
                const host = document.querySelector('#dockEditor .word-page-content');
                if(host){
                  let fb = host.querySelector('.fallback-area');
                  if(!fb){ fb = document.createElement('div'); fb.className='fallback-area'; host.innerHTML=''; host.appendChild(fb); }
                  fb.innerHTML = tpl; localStorage.setItem(LOCAL_HTML_KEY, tpl); fb.focus();
                }
              }
              const stEl = document.getElementById('dockStatus');
              if(stEl) stEl.textContent='Template reapplied '+ new Date().toLocaleTimeString();
              updateWordStats();
            });
          } catch(e){ console.warn('reset failed', e); }
        });
      }
      // Attempt load server submission (if any) to reflect
      fetch('/api/dock-doc').then(r=> r.ok ? r.json():null).then(data=>{
        if(!data) return;
        if(data.submitted && data.html){
          if(quill){ quill.root.innerHTML = data.html; }
          else if(editorEl.dataset.fallback==='1'){ editorEl.firstElementChild.innerHTML = data.html; }
          statusEl.textContent = 'Submitted at '+ new Date(data.submittedAt).toLocaleString();
          submitBtn.disabled=true; disableEditing();
          if(resetBtn) resetBtn.disabled = true;
          localStorage.setItem(SUBMIT_FLAG_KEY,'1');
        }
      }).catch(()=>{});
      // Focus on first open
      setTimeout(()=>{
        if(quill) quill.focus(); else if(editorEl.dataset.fallback==='1'){ editorEl.firstElementChild.focus(); }
      }, 100);
    });
  }

  function sanitize(html){
    return (html||'').replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi,'');
  }

  function disableEditing(){
    if(ck){
      try { ck.enableReadOnlyMode('submitted'); } catch(_){ }
    } else if(quill){ quill.disable(); }
    else {
      const editorEl = document.getElementById('dockEditor');
      if(editorEl){
        const fb = editorEl.querySelector('.fallback-area');
        if(fb){ fb.setAttribute('contenteditable','false'); }
      }
    }
  }

  async function submitDocument(){
    if(submitting) return; submitting=true;
    try {
      const btn = document.getElementById('dockBtnSubmit');
      const statusEl = document.getElementById('dockStatus');
      if(btn) btn.disabled = true;
      if(statusEl) statusEl.textContent='Submitting...';
      let html = getCurrentHTML();
      html = sanitize(html);
      const r = await fetch('/api/dock-doc/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ html })});
      if(r.ok){
        const j = await r.json();
        if(statusEl) statusEl.textContent='Submitted at '+ new Date(j.submittedAt).toLocaleString();
        localStorage.setItem(SUBMIT_FLAG_KEY,'1');
        disableEditing();
      } else {
        if(statusEl) statusEl.textContent='Submit failed';
        if(btn) btn.disabled=false;
      }
    } catch(e){
      const statusEl = document.getElementById('dockStatus');
      if(statusEl) statusEl.textContent='Submit error';
      const btn = document.getElementById('dockBtnSubmit');
      if(btn) btn.disabled=false;
    } finally {
      submitting=false;
    }
  }

  function toggleDock() {
    const dock = document.getElementById(DOCK_ID);
    if (!dock) return;
    const arrow = dock.querySelector('.collab-dock-arrow');
    isOpen = !isOpen;
    if (isOpen) {
      dock.classList.remove('closed');
      dock.classList.add('open');
      if (arrow) arrow.textContent = '▼';
      initEditor();
    } else {
      dock.classList.remove('open');
      dock.classList.add('closed');
      if (arrow) arrow.textContent = '▲';
    }
  }

  function closeDock(){ if(isOpen) toggleDock(); }

  if(!window.__collabDock){
    window.__collabDock = { 
      open: () => { if(!isOpen) toggleDock(); }, 
      close: closeDock, 
      toggle: toggleDock,
      resetTemplate: () => {
        if(localStorage.getItem(SUBMIT_FLAG_KEY)==='1') return false;
        localStorage.removeItem(LOCAL_DELTA_KEY);
        localStorage.removeItem(LOCAL_HTML_KEY);
        fetch('/api/dock-doc/template').then(r=> r.ok? r.json():null).then(j=> j && j.html ? j.html : FALLBACK_TEMPLATE).then(tpl=>{
          const editorEl = document.getElementById('dockEditor');
          if(ck){
            ck.setData(tpl); try { localStorage.setItem(LOCAL_HTML_KEY, ck.getData()); } catch(_){ }
          } else if(quill){
            quill.setContents([]); quill.clipboard.dangerouslyPasteHTML(tpl);
            try { localStorage.setItem(LOCAL_HTML_KEY, quill.root.innerHTML); localStorage.setItem(LOCAL_DELTA_KEY, JSON.stringify(quill.getContents())); } catch(_){ }
          } else if(editorEl){
            const host = editorEl.querySelector('.word-page-content') || editorEl;
            let fb = host.querySelector('.fallback-area');
            if(!fb){ fb=document.createElement('div'); fb.className='fallback-area'; host.innerHTML=''; host.appendChild(fb); }
            fb.innerHTML = tpl;
            try { localStorage.setItem(LOCAL_HTML_KEY, tpl); } catch(_){ }
          }
          updateWordStats();
        });
        return true;
      }
    };
  }

  function getCurrentHTML(){
    if(ck){ return ck.getData(); }
    if(quill){ return quill.root.innerHTML; }
    const editorEl = document.getElementById('dockEditor');
    const fb = editorEl ? editorEl.querySelector('.fallback-area') : null;
    return fb ? fb.innerHTML : '';
  }

  function initQuillPath(submittedAlready, editorEl, headerEl){
    ensureWordLook(editorEl);
    const host = editorEl.querySelector('.word-page-content');
    const toolbarOptions = [
      [{ font: [] }, { size: [] }],
      ['bold','italic','underline','strike'],
      [{ color: [] }, { background: [] }],
      [{ script: 'sub'}, { script: 'super' }],
      [{ header: 1 }, { header: 2 }],
      [{ list: 'ordered' }, { list: 'bullet' }],
      [{ indent: '-1' }, { indent: '+1' }],
      [{ align: [] }],
      ['blockquote','code-block'],
      ['clean']
    ];
    if(headerEl) headerEl.style.display='block';
    quill = new Quill(host, {
      theme: 'snow',
      modules: { toolbar: toolbarOptions, history: { delay: 1000, maxStack: 200, userOnly: true } }
    });
    buildRibbon('quill');
    try {
      const savedDelta = localStorage.getItem(LOCAL_DELTA_KEY);
      if(savedDelta){
        quill.setContents(JSON.parse(savedDelta));
      } else {
        quill.setContents([]);
        quill.clipboard.dangerouslyPasteHTML(DETAILED_FALLBACK);
        fetchTemplate().then(tpl => {
          if(/Offline Template/.test(quill.root.innerHTML)){
            quill.setContents([]);
            quill.clipboard.dangerouslyPasteHTML(tpl);
          }
          try { localStorage.setItem(LOCAL_HTML_KEY, quill.root.innerHTML); localStorage.setItem(LOCAL_DELTA_KEY, JSON.stringify(quill.getContents())); } catch(_e){}
        });
      }
    } catch(e){ console.warn('delta parse failed', e); }
    quill.on('text-change', ()=>{
      if(submitting) return;
      try { localStorage.setItem(LOCAL_DELTA_KEY, JSON.stringify(quill.getContents())); } catch(_){ }
      try { localStorage.setItem(LOCAL_HTML_KEY, editorEl.querySelector('.ql-editor').innerHTML); } catch(_){ }
      const stEl = document.getElementById('dockStatus');
      if(stEl && !submittedAlready) stEl.textContent = 'Draft saved '+ new Date().toLocaleTimeString();
      updateWordStats();
    });
    updateWordStats();
  }

  function buildRibbon(mode){
    if(ribbonInitialized) return;
    const headerEl = document.getElementById('dockEditorHeader');
    if(!headerEl) return;
    headerEl.style.display='block';
    headerEl.innerHTML = `
      <div class="ribbon-row">
        <div class="ribbon-group" data-group="clipboard">
          <button data-cmd="undo" title="Undo">⟲</button>
          <button data-cmd="redo" title="Redo">⟳</button>
        </div>
        <div class="ribbon-group" data-group="font">
          <select data-cmd="heading" title="Heading">
            <option value="paragraph">Normal</option>
            <option value="heading1">H1</option>
            <option value="heading2">H2</option>
            <option value="heading3">H3</option>
          </select>
          <button data-cmd="bold" title="Bold"><strong>B</strong></button>
          <button data-cmd="italic" title="Italic"><em>I</em></button>
          <button data-cmd="underline" title="Underline"><span style="text-decoration:underline">U</span></button>
          <button data-cmd="strikethrough" title="Strikethrough"><span style="text-decoration:line-through">S</span></button>
        </div>
        <div class="ribbon-group" data-group="para">
          <button data-cmd="bulletedList" title="Bulleted List">• List</button>
          <button data-cmd="numberedList" title="Numbered List">1. List</button>
          <button data-cmd="outdent" title="Decrease Indent">⇤</button>
          <button data-cmd="indent" title="Increase Indent">⇥</button>
          <button data-cmd="alignment" data-value="left" title="Align Left">⯇</button>
          <button data-cmd="alignment" data-value="center" title="Align Center">≡</button>
          <button data-cmd="alignment" data-value="right" title="Align Right">⯈</button>
          <button data-cmd="alignment" data-value="justify" title="Justify">☰</button>
        </div>
        <div class="ribbon-group" data-group="insert">
          <button data-cmd="link" title="Insert Link">🔗</button>
          <button data-cmd="blockQuote" title="Block Quote">❝❞</button>
          <button data-cmd="codeBlock" title="Code Block">{ }</button>
          <button data-cmd="horizontalLine" title="Horizontal Line">―</button>
          <button data-cmd="insertTable" title="Insert Table">⌗</button>
        </div>
        <div class="ribbon-group" data-group="clear">
          <button data-cmd="removeFormat" title="Clear Formatting">⌫Fmt</button>
        </div>
      </div>`;
    if(!document.getElementById('ribbonStyles')){
      const s=document.createElement('style');
      s.id='ribbonStyles';
      s.textContent=`
        .word-toolbar{background:#fff;border-bottom:1px solid #d0d7e2;padding:6px 8px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;position:sticky;top:0;z-index:5;}
        .word-toolbar .ribbon-group{display:inline-flex;align-items:center;gap:4px;padding:4px 6px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;}
        .word-toolbar button{background:#fff;border:1px solid #cfd8e3;border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer;line-height:1.1;}
        .word-toolbar button:hover{background:#eef2f7;}
        .word-toolbar button.active{background:#2563eb;color:#fff;border-color:#1d4ed8;}
        .word-toolbar select{font-size:12px;padding:3px 4px;border:1px solid #cfd8e3;border-radius:4px;background:#fff;}
        .ck-toolbar{display:none !important;} /* hide default CK toolbar */
      `;
      document.head.appendChild(s);
    }
    headerEl.addEventListener('click', e=>{
      const btn = e.target.closest('button');
      if(!btn) return;
      const cmd = btn.getAttribute('data-cmd');
      const val = btn.getAttribute('data-value');
      runCommand(mode, cmd, val);
    });
    headerEl.addEventListener('change', e=>{
      const sel = e.target.closest('select[data-cmd]');
      if(!sel) return;
      runCommand(mode, sel.getAttribute('data-cmd'), sel.value);
    });
    if(mode==='ck'){ ck && ck.editing.view.document.on('selectionChange', ()=> refreshActiveStates(mode)); }
    ribbonInitialized = true;
  }

  function runCommand(mode, cmd, value){
    if(mode==='ck' && ck){
      try {
        switch(cmd){
          case 'undo': return ck.execute('undo');
          case 'redo': return ck.execute('redo');
          case 'bold': return ck.execute('bold');
          case 'italic': return ck.execute('italic');
          case 'underline': return ck.execute('underline');
          case 'strikethrough': return ck.execute('strikethrough');
          case 'bulletedList': return ck.execute('bulletedList');
          case 'numberedList': return ck.execute('numberedList');
          case 'outdent': return ck.execute('outdent');
          case 'indent': return ck.execute('indent');
          case 'alignment': return ck.execute('alignment', { value });
          case 'blockQuote': return ck.execute('blockQuote');
          case 'codeBlock': return ck.execute('codeBlock');
          case 'horizontalLine': return ck.execute('horizontalLine');
          case 'insertTable': return ck.execute('insertTable', { rows:3, columns:3 });
          case 'removeFormat': return ck.execute('removeFormat');
          case 'heading':
            if(value==='paragraph') return ck.execute('paragraph');
            if(value==='heading1') return ck.execute('heading', { value:'heading1' });
            if(value==='heading2') return ck.execute('heading', { value:'heading2' });
            if(value==='heading3') return ck.execute('heading', { value:'heading3' });
            return;
          case 'link':
            const url = prompt('Enter URL');
            if(url){ ck.execute('link', url); }
            return;
        }
      } catch(err){ console.warn('CK cmd failed', cmd, err); }
      finally { refreshActiveStates(mode); }
    } else if(mode==='quill' && quill){
      const range = quill.getSelection();
      switch(cmd){
        case 'undo': return quill.history.undo();
        case 'redo': return quill.history.redo();
        case 'bold': return quill.format('bold', true);
        case 'italic': return quill.format('italic', true);
        case 'underline': return quill.format('underline', true);
        case 'strikethrough': return quill.format('strike', true);
        case 'bulletedList': return quill.format('list', 'bullet');
        case 'numberedList': return quill.format('list', 'ordered');
        case 'outdent': return quill.format('indent', (quill.getFormat().indent||0)-1);
        case 'indent': return quill.format('indent', (quill.getFormat().indent||0)+1);
        case 'alignment': return quill.format('align', value==='left'?false:value);
        case 'blockQuote': return quill.format('blockquote', true);
        case 'codeBlock': return quill.format('code-block', true);
        case 'horizontalLine': document.execCommand && document.execCommand('insertHorizontalRule'); return;
        case 'insertTable': alert('Table insertion not supported in Quill fallback'); return;
        case 'removeFormat': return quill.removeFormat(range.index, range.length||0);
        case 'heading':
          if(value==='paragraph') quill.format('header', false); else if(value==='heading1') quill.format('header',1); else if(value==='heading2') quill.format('header',2); else if(value==='heading3') quill.format('header',3);
          return;
        case 'link':
          const url = prompt('Enter URL');
          if(url && range && range.length>0){ quill.format('link', url); }
          return;
      }
      refreshActiveStates(mode);
    }
  }

  function refreshActiveStates(mode){
    const headerEl = document.getElementById('dockEditorHeader');
    if(!headerEl) return;
    const buttons = headerEl.querySelectorAll('button[data-cmd]');
    buttons.forEach(b=> b.classList.remove('active'));
    if(mode==='ck' && ck){
      const sel = ck.model.document.selection;
      const attrs = {};
      sel.getAttributes && Array.from(sel.getAttributes()).forEach(([k,v])=> attrs[k]=v);
      function mark(cmd){ const btn = headerEl.querySelector('button[data-cmd="'+cmd+'"]'); if(btn) btn.classList.add('active'); }
      if(ck.commands.get('bold').value) mark('bold');
      if(ck.commands.get('italic').value) mark('italic');
      if(ck.commands.get('underline') && ck.commands.get('underline').value) mark('underline');
      if(ck.commands.get('strikethrough') && ck.commands.get('strikethrough').value) mark('strikethrough');
      const alignCmd = ck.commands.get('alignment');
      if(alignCmd && alignCmd.value){
        const btn = headerEl.querySelector('button[data-cmd="alignment"][data-value="'+alignCmd.value+'"]');
        if(btn) btn.classList.add('active');
      }
    } else if(mode==='quill' && quill){
      const format = quill.getFormat();
      function mark(cmd, check){ if(check){ const btn = headerEl.querySelector('button[data-cmd="'+cmd+'"]'); if(btn) btn.classList.add('active'); } }
      mark('bold', format.bold);
      mark('italic', format.italic);
      mark('underline', format.underline);
      mark('strikethrough', format.strike);
      if(format.align){
        const btn = headerEl.querySelector('button[data-cmd="alignment"][data-value="'+format.align+'"]');
        if(btn) btn.classList.add('active');
      }
    }
  }

  function ensureWordLook(container){
    if(wordLookApplied) return;
    if(!container.querySelector('.word-shell')){
      container.innerHTML = '<div class="word-shell"><div class="word-page"><div class="word-page-content"></div></div></div>';
    }
    if(!document.getElementById('wordLookStyles')){
      const style=document.createElement('style');
      style.id='wordLookStyles';
      style.textContent = `
        .word-shell{height:100%;overflow:auto;padding:32px 0;background:#f5f6f8;}
        .word-page{background:#fff;width:816px;min-height:1100px;margin:0 auto 48px;padding:96px 88px 120px;box-shadow:0 6px 18px -6px rgba(0,0,0,.25),0 0 0 1px #d0d7e2;position:relative;}
        .word-page:after{content:'';position:absolute;inset:0;pointer-events:none;border:1px solid #eceff3;}
        .word-page-content{min-height:900px;}
        .word-page-content h1,h2,h3,h4{font-weight:600;line-height:1.25;margin:1.6em 0 .6em;}
        .word-page-content p{line-height:1.55;margin:0 0 1em;}
        .word-page-content table{border-collapse:collapse;margin:12px 0;background:#fff;}
        .word-page-content table td,.word-page-content table th{border:1px solid #d0d7e2;padding:6px 8px;font-size:13px;}
        .word-page-content code{background:#f1f3f6;padding:2px 4px;border-radius:4px;font-size:90%;}
        .word-page-content pre{background:#0f172a;color:#e2e8f0;padding:14px 16px;border-radius:8px;overflow:auto;font-size:13px;line-height:1.4;}
        .word-page-content blockquote{margin:12px 0;padding:8px 14px;border-left:4px solid #6366f1;background:#f5f7fb;color:#374151;}
        .ck-editor__editable{min-height:900px;}
        .fallback-area{min-height:900px;outline:none;}
        .fallback-area:focus{box-shadow:0 0 0 2px #dbeafe,0 0 0 1px #60a5fa inset;}
        .dock-editor-actions{align-items:center;}
      `;
      document.head.appendChild(style);
    }
    wordLookApplied = true;
  }

  function updateWordStats(){
    const statsEl = document.getElementById('dockWordStats');
    if(!statsEl) return;
    const html = getCurrentHTML();
    const text = html.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
    if(!text){ statsEl.textContent='Words: 0 | Chars: 0'; statsEl.style.display='inline'; return; }
    const words = text.split(/\s+/).filter(Boolean).length;
    const chars = text.replace(/\s+/g,' ').length;
    statsEl.textContent = 'Words: '+words+' | Chars: '+chars;
    statsEl.style.display='inline';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createDock); else createDock();
})();