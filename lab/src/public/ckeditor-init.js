// Unified CKEditor initializer for task pages
(function(){
  const CK_SRC = '/vendor/ckeditor/ckeditor5-build-classic-dna-master/build/ckeditor.js';
  if(!window.ClassicEditor){
    const s=document.createElement('script');
    s.src=CK_SRC;
    s.onload=initAll;
    s.onerror=()=>console.warn('[ck-init] Failed to load CKEditor build');
    document.head.appendChild(s);
  } else {
    initAll();
  }

  function initAll(){
    const textareas=[...document.querySelectorAll('textarea')]
      .filter(t=>!t.classList.contains('json') && !t.classList.contains('ck-skip'));
    textareas.forEach(upgradeOne);
  }

  function upgradeOne(ta){
    if(ta.__ckAttached) return; ta.__ckAttached=true;
    const id=ta.id || ('ta_'+Math.random().toString(36).slice(2));
    if(!ta.id) ta.id=id;
    // Wrapper
    const wrap=document.createElement('div');
    wrap.className='ckeditor-container';
    wrap.style.marginTop='8px';
    ta.parentNode.insertBefore(wrap, ta.nextSibling);
    const holder=document.createElement('div');
    holder.id=id+'_ck';
    wrap.appendChild(holder);
    const placeholder=ta.getAttribute('placeholder')||'Type your answer...';
    const existingValue=ta.value;

    ClassicEditor.create(holder,{
      placeholder,
      toolbar:{ items:['heading','|','bold','italic','underline','|','bulletedList','numberedList','|','code','codeBlock','|','link','insertTable','blockQuote','|','undo','redo'] }
    }).then(editor=>{
      if(existingValue){ editor.setData(existingValue); }
      // Persistence per textarea id
      const storeKey='ck_ans_'+id;
      try{
        const saved=localStorage.getItem(storeKey);
        if(saved){ editor.setData(saved); }
      }catch(e){}
      editor.model.document.on('change:data',()=>{
        const data=editor.getData();
        ta.value=data; // keep underlying textarea for legacy submit handlers
        try{ localStorage.setItem(storeKey,data); }catch(e){}
      });
    }).catch(err=>{
      console.warn('[ck-init] Editor failed',err);
    });
    // Hide original textarea (keep for forms / scripts)
    ta.style.display='none';
  }
})();
