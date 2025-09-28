// answer-save.js
// Collects CKEditor/textarea contents for a task page and saves to backend with debounce.
// Usage: include <script src="/answer-save.js" data-task-id="incident"></script>
// Requires candidate logged in (candidate cookie + localStorage candidateEmail)

(function(){
  const taskId = (document.currentScript && document.currentScript.getAttribute('data-task-id')) || document.body.getAttribute('data-task-id') || 'unknown';
  const email = localStorage.getItem('candidateEmail');
  if(!email){ console.warn('[answer-save] no candidateEmail in localStorage'); return; }

  function collectFields(){
    const fields={};
    if(localStorage.getItem('candidateSubmitted')==='1') return fields; // locked
    // CKEditor instances (if global ClassicEditor existing)
    if(window.ClassicEditor && window._ckeditorInstances){
      Object.entries(window._ckeditorInstances).forEach(([id, inst])=>{
        try{ fields[id]=inst.getData(); }catch(e){}
      });
    }
    // Fallback: textareas with data-answer
    document.querySelectorAll('textarea[data-answer]')
      .forEach(t=>{ fields[t.name||t.id||'field_'+Math.random().toString(36).slice(2)]=t.value; });
    return fields;
  }

  let pending=false; let lastPayload=null; let timer=null; const INTERVAL=2000;
  function schedule(){
    if(timer) clearTimeout(timer);
    timer=setTimeout(saveNow, INTERVAL);
  }

  async function saveNow(){
    timer=null;
    if(localStorage.getItem('candidateSubmitted')==='1'){ return; }
    const fields=collectFields();
    const payload=JSON.stringify(fields);
    if(lastPayload===payload){ return; } // nothing changed
    lastPayload=payload;
    pending=true;
    try{
      const res=await fetch('/api/candidate/answers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,taskId,fields})});
      if(!res.ok){ console.warn('[answer-save] save failed', res.status); }
      else { const js=await res.json(); console.log('[answer-save] saved', js); markSaved(); }
    }catch(e){ console.error('[answer-save] error', e); }
    pending=false;
  }

  function markSaved(){
    let badge=document.getElementById('answerSaveStatus');
    if(!badge){
      badge=document.createElement('div');
      badge.id='answerSaveStatus';
      badge.style.position='fixed';
      badge.style.bottom='8px';
      badge.style.right='8px';
      badge.style.background='#0b5';
      badge.style.color='#fff';
      badge.style.padding='4px 10px';
      badge.style.fontSize='12px';
      badge.style.borderRadius='4px';
      badge.style.boxShadow='0 2px 4px rgba(0,0,0,0.3)';
      document.body.appendChild(badge);
    }
    badge.textContent='Saved '+new Date().toLocaleTimeString();
  }

  // Hook CKEditor change events
  if(window._ckeditorInstances){
    Object.values(window._ckeditorInstances).forEach(inst=>{
      inst.model.document.on('change:data', schedule);
    });
  } else {
    document.addEventListener('ckeditor-ready', (e)=>{
      try{ const inst=e.detail.instance; inst.model.document.on('change:data', schedule); }catch(_e){}
    });
  }

  // Fallback: listen to textarea changes
  document.querySelectorAll('textarea[data-answer]').forEach(t=>{
    t.addEventListener('input', schedule);
  });

  // Manual save button (optional)
  if(!document.getElementById('answerManualSave')){
    const btn=document.createElement('button');
    btn.id='answerManualSave';
    btn.textContent='Save Now';
    btn.style.position='fixed';
    btn.style.bottom='8px';
    btn.style.right='110px';
    btn.style.background='#1976d2';
    btn.style.color='#fff';
    btn.style.border='none';
    btn.style.padding='6px 12px';
    btn.style.borderRadius='4px';
    btn.style.cursor='pointer';
    btn.addEventListener('click', saveNow);
    document.body.appendChild(btn);
  }

  // Initial save after short delay
  setTimeout(saveNow, 1000);
})();
