// auto-save.js
// Universal auto-save for all text inputs, textareas, and CKEditor instances
// Saves every 2 seconds when changes are detected
// Broadcasts changes via socket.io for live admin monitoring

(function() {
  const taskId = (document.currentScript && document.currentScript.getAttribute('data-task-id')) 
    || document.body.getAttribute('data-task-id') 
    || 'unknown';
  
  let email = localStorage.getItem('candidateEmail');
  let pendingChanges = false;
  let lastSaveData = null;
  let emailResolved = false;
  
  // Extract slug from URL for email resolution
  const urlParams = new URLSearchParams(location.search);
  let viewEmail = urlParams.get('email');
  
  // Try to get email from cookies first
  const cookies = document.cookie.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {});
  
  const candidateSlug = cookies.candidateSlug;
  
  // Function to resolve email asynchronously
  async function resolveEmail() {
    if (email) {
      emailResolved = true;
      return email;
    }
    
    if (viewEmail) {
      email = viewEmail;
      emailResolved = true;
      return email;
    }
    
    try {
      const parts = location.pathname.split('/').filter(Boolean);
      let slugCandidate = candidateSlug || null;
      
      // Extract from URL if not in cookies
      if (!slugCandidate) {
        if (parts[0] === 'generated' && parts[1]) slugCandidate = parts[1];
        else if (parts[0] === 'c' && parts[1]) slugCandidate = parts[1];
      }
      
      if (slugCandidate) {
        const response = await fetch('/public/slug/' + encodeURIComponent(slugCandidate) + '/info');
        if (response.ok) {
          const info = await response.json();
          if (info && info.email) {
            email = info.email;
            localStorage.setItem('candidateEmail', email);
            emailResolved = true;
            console.log('[AutoSave] Email resolved:', email);
            return email;
          }
        }
      }
    } catch(e) {
      console.error('[AutoSave] Failed to resolve email:', e);
    }
    
    return null;
  }
  
  // Resolve email immediately and aggressively
  (async function() {
    await resolveEmail();
    if (email) {
      console.log('[AutoSave] ✓ Email ready:', email);
    } else {
      console.error('[AutoSave] ✗ Email NOT resolved! Auto-save will fail.');
      showSaveBadge('No email - save disabled', '#ef4444');
    }
  })();

  // Collect all field values
  function collectFields() {
    const fields = {};
    
    // Collect all textareas
    document.querySelectorAll('textarea').forEach((el, idx) => {
      const fieldName = el.name || el.id || `textarea_${idx}`;
      fields[fieldName] = el.value;
    });
    
    // Collect all text inputs (excluding password/hidden)
    document.querySelectorAll('input[type="text"]').forEach((el, idx) => {
      const fieldName = el.name || el.id || `input_${idx}`;
      fields[fieldName] = el.value;
    });
    
    // Collect CKEditor instances if available
    if (window.CKEDITOR) {
      for (const instanceName in window.CKEDITOR.instances) {
        const editor = window.CKEDITOR.instances[instanceName];
        fields[instanceName] = editor.getData();
      }
    }
    
    return fields;
  }

  // Save to backend
  async function saveNow() {
    // Wait for email to be resolved if not yet
    if (!emailResolved) {
      console.log('[AutoSave] Waiting for email resolution...');
      await resolveEmail();
    }
    
    if (!email) {
      console.error('[AutoSave] ✗ Cannot save - no email available');
      showSaveBadge('No email - cannot save', '#ef4444');
      return;
    }
    
    const fields = collectFields();
    const dataStr = JSON.stringify(fields);
    
    // Skip if no changes
    if (dataStr === lastSaveData) {
      pendingChanges = false;
      console.log('[AutoSave] No changes detected, skipping save');
      return;
    }
    
    lastSaveData = dataStr;
    pendingChanges = false;
    
    console.log('[AutoSave] Saving to server...', {email, taskId, fieldCount: Object.keys(fields).length});
    
    try {
      const response = await fetch('/api/candidate/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          taskId: taskId,
          fields: fields
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        showSaveBadge('Saved ✓', '#10b981');
        console.log('[AutoSave] ✓ Saved successfully:', result);
      } else {
        const errorText = await response.text();
        showSaveBadge('Save failed', '#ef4444');
        console.error('[AutoSave] ✗ Save failed:', response.status, errorText);
      }
    } catch (error) {
      showSaveBadge('Save error', '#ef4444');
      console.error('[AutoSave] ✗ Save error:', error);
    }
  }

  // Show save status badge
  function showSaveBadge(text, color) {
    let badge = document.getElementById('autoSaveStatus');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'autoSaveStatus';
      badge.style.cssText = `
        position: fixed;
        bottom: 12px;
        right: 12px;
        background: ${color};
        color: white;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 600;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        transition: opacity 0.3s;
      `;
      document.body.appendChild(badge);
    }
    
    badge.textContent = text;
    badge.style.background = color;
    badge.style.opacity = '1';
    
    clearTimeout(badge.hideTimer);
    badge.hideTimer = setTimeout(() => {
      badge.style.opacity = '0';
    }, 2000);
  }

  // Mark changes as pending and trigger immediate save after 500ms
  let saveTimeout = null;
  function markChanged() {
    pendingChanges = true;
    showSaveBadge('Typing...', '#6b7280');
    
    // Debounce: save 500ms after last keystroke
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveNow();
    }, 500);
  }

  // Also run auto-save every 3 seconds as backup
  setInterval(() => {
    if (pendingChanges) {
      saveNow();
    }
  }, 3000);

  // Listen for changes on all text inputs
  function attachListeners() {
    document.querySelectorAll('textarea, input[type="text"]').forEach(el => {
      // Remove old listeners to avoid duplicates
      el.removeEventListener('input', markChanged);
      el.removeEventListener('change', markChanged);
      
      // Add new listeners
      el.addEventListener('input', markChanged);
      el.addEventListener('change', markChanged);
    });
    
    // Listen for CKEditor changes
    if (window.CKEDITOR) {
      for (const instanceName in window.CKEDITOR.instances) {
        const editor = window.CKEDITOR.instances[instanceName];
        // Remove old listener
        editor.removeListener('change', markChanged);
        // Add new listener
        editor.on('change', markChanged);
      }
    }
  }

  // Initialize after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      attachListeners();
      console.log('[AutoSave] Listeners attached on DOMContentLoaded');
    });
  } else {
    attachListeners();
    console.log('[AutoSave] Listeners attached immediately');
  }

  // Re-attach listeners periodically in case new elements are added
  setInterval(attachListeners, 5000);
  
  // Log initialization status
  console.log('[AutoSave] Initialized for task:', taskId);
  console.log('[AutoSave] Initial email:', email || 'not yet resolved');
  console.log('[AutoSave] Candidate slug from cookies:', candidateSlug || 'none');

  // Save before page unload - ALWAYS save, don't check pendingChanges
  window.addEventListener('beforeunload', async (e) => {
    const fields = collectFields();
    
    // Check if there's any content to save
    const hasContent = Object.values(fields).some(v => v && String(v).trim());
    if (!hasContent) {
      return; // Nothing to save
    }
    
    // Ensure email is resolved
    if (!email && !emailResolved) {
      await resolveEmail();
    }
    
    if (email) {
      // Try synchronous beacon first
      try {
        const payload = JSON.stringify({
          email: email,
          taskId: taskId,
          fields: fields
        });
        
        navigator.sendBeacon('/api/candidate/answers', new Blob([payload], { type: 'application/json' }));
        console.log('[AutoSave] Saved on page unload via sendBeacon');
      } catch (err) {
        console.error('[AutoSave] sendBeacon failed:', err);
        
        // Fallback to synchronous XHR
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/candidate/answers', false); // synchronous
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.send(JSON.stringify({
            email: email,
            taskId: taskId,
            fields: fields
          }));
          console.log('[AutoSave] Saved on page unload via XHR');
        } catch (xhrErr) {
          console.error('[AutoSave] XHR fallback failed:', xhrErr);
        }
      }
    } else {
      console.error('[AutoSave] Cannot save on unload - no email');
    }
  });

  console.log('[AutoSave] Initialized for task:', taskId);
})();
