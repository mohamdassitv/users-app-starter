// Global rich editor transformer (white theme Quill wrappers)
(function(){
  const CDN_CSS = 'https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.snow.css';
  const CDN_JS  = 'https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.min.js';
  if(!document.querySelector('link[data-quill-global]')){
    const l=document.createElement('link'); l.rel='stylesheet'; l.href=CDN_CSS; l.setAttribute('data-quill-global',''); document.head.appendChild(l);
  }
  function ensureScript(cb){
    if(window.Quill) return cb();
    const s=document.createElement('script'); s.src=CDN_JS; s.onload=cb; s.onerror=()=>cb(new Error('Quill load failed')); document.head.appendChild(s);
  }
  function initOne(textarea){
    if(textarea.__rich) return; textarea.__rich=true;
    const wrap=document.createElement('div');
    wrap.className='rich-inline white';
    const editor=document.createElement('div'); editor.className='ri-editor';
    // Insert wrapper before textarea
    textarea.parentNode.insertBefore(wrap, textarea);
    wrap.appendChild(editor);
    textarea.hidden=true;
    const placeholder=textarea.getAttribute('placeholder')||'';
    const modules={ toolbar:[ ['bold','italic','underline','strike'], [{list:'ordered'},{list:'bullet'}], ['code-block','blockquote'], ['link'] ] };
    const q=new Quill(editor,{theme:'snow',placeholder,modules});
    if(textarea.value){ q.clipboard.dangerouslyPasteHTML(textarea.value); }
    q.on('text-change',()=>{
      textarea.value = editor.querySelector('.ql-editor').innerHTML;
      textarea.dispatchEvent(new Event('input',{bubbles:true}));
    });
  }
  function scan(){
    document.querySelectorAll('textarea[data-rich="1"]').forEach(initOne);
  }
  ensureScript(()=>{
    scan();
    // Mutation observer for dynamically added areas
    const mo=new MutationObserver(()=>scan());
    mo.observe(document.body,{subtree:true,childList:true});
  });
})();