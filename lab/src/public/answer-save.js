// answer-save.js
// Collects CKEditor/textarea contents for a task page and saves to backend with debounce.
// Usage: include <script src="/answer-save.js" data-task-id="incident"></script>
// Requires candidate logged in (candidate cookie + localStorage candidateEmail)

(function(){
  const taskId = (document.currentScript && document.currentScript.getAttribute('data-task-id')) || document.body.getAttribute('data-task-id') || 'unknown';
  let email = localStorage.getItem('candidateEmail');
  const urlParams = new URLSearchParams(location.search);
  let viewEmail = urlParams.get('email');
  // Attempt slug extraction: paths like /generated/<slug>/... or /c/<slug>/<token>
  if(!email && !viewEmail){
    try {
      const parts = location.pathname.split('/').filter(Boolean);
      // patterns: generated, slug, file  OR  c, slug, token
      let slugCandidate=null;
      if(parts[0]==='generated' && parts[1]) slugCandidate=parts[1];
      else if(parts[0]==='c' && parts[1]) slugCandidate=parts[1];
      if(slugCandidate){
        // Try public first, then admin-protected
        fetch('/public/slug/'+encodeURIComponent(slugCandidate)+'/info')
          .then(r=> r.ok? r.json():null)
          .then(info=> info || fetch('/api/admin/slug/'+encodeURIComponent(slugCandidate)+'/info').then(r=> r.ok? r.json():null))
          .then(info=>{
          if(info && info.email){
            viewEmail = info.email;
            if(!email){ email = viewEmail; initAfterResolve(); }
          }
        }).catch(()=>{});
      }
    }catch(_e){}
  }
  // Deprecated: all per-task in-browser answer saving removed.
  // Kept as a harmless stub to avoid 404 for cached pages referencing it.
  (function(){ /* noop */})();

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
  function attachEditors(){
    if(window._ckeditorInstances){
      Object.values(window._ckeditorInstances).forEach(inst=>{ try{ inst.model.document.on('change:data', schedule); }catch(_e){} });
    } else {
      document.addEventListener('ckeditor-ready', (e)=>{ try{ const inst=e.detail.instance; inst.model.document.on('change:data', schedule); }catch(_e){} });
    }
  }


  // Fallback: listen to textarea changes
  function attachTextareaListeners(){
    if(isReadOnlyView) return;
    document.querySelectorAll('textarea[data-answer]').forEach(t=>{ t.addEventListener('input', schedule); });
  }


  // Manual save button (optional)
  if(!isReadOnlyView && !document.getElementById('answerManualSave')){
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
  function primeSave(){ if(!isReadOnlyView) setTimeout(saveNow,1000); }

  // If we already have email now (candidate or ?email), finish setup
  if(email) { attachEditors(); attachTextareaListeners(); if(!isReadOnlyView) primeSave(); }
  else { // slug resolution path will call initAfterResolve later
    attachTextareaListeners();
  }
})();
