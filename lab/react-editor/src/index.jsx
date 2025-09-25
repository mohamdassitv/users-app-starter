import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import ClassicEditor from '@ckeditor/ckeditor5-build-classic';

function DockReactEditor({ initialData, onChange, readOnly }) {
  const lastDataRef = useRef(initialData || '');
  return (
    <CKEditor
      editor={ClassicEditor}
      disabled={!!readOnly}
      data={initialData}
      onChange={(_, editor) => {
        const d = editor.getData();
        lastDataRef.current = d;
        onChange && onChange(d);
      }}
    />
  );
}

export function mountReactEditor(opts) {
  const { host, initialHTML, onContent, readOnly } = opts;
  const root = createRoot(host);
  root.render(<DockReactEditor initialData={initialHTML} onChange={onContent} readOnly={readOnly} />);
  return {
    getData: () => host.querySelector('.ck-editor__editable')?.innerHTML || '',
    destroy: () => root.unmount()
  };
}

// Auto-mount hook if window.__mountDockReactEditorRequests queue exists
if (window.__mountDockReactEditorRequests && Array.isArray(window.__mountDockReactEditorRequests)) {
  window.__mountDockReactEditorRequests.forEach(req => {
    try { req.resolve(mountReactEditor(req.opts)); } catch (e) { req.reject(e); }
  });
  window.__mountDockReactEditorRequests.length = 0;
}

window.__mountDockReactEditor = (opts) => new Promise((resolve, reject) => {
  if (!window.ReactEditorBundleLoaded) {
    if (!window.__mountDockReactEditorRequests) window.__mountDockReactEditorRequests = [];
    window.__mountDockReactEditorRequests.push({ opts, resolve, reject });
  } else {
    try { resolve(mountReactEditor(opts)); } catch(e){ reject(e); }
  }
});

window.ReactEditorBundleLoaded = true;
