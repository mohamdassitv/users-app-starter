// SIMPLE AUTO-SAVE - No complex async, just save immediately
(function() {
  const taskId = (document.currentScript && document.currentScript.getAttribute('data-task-id')) 
    || document.body.getAttribute('data-task-id') 
    || 'unknown';
  
  console.log('[SimpleAutoSave] Starting for task:', taskId);
  
  // Parse cookies first
  const cookies = document.cookie.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    if (key) acc[key] = value;
    return acc;
  }, {});
  
  const isAdmin = cookies.admin === '1';
  const isManager = cookies.manager === '1';
  const isCandidate = cookies.candidate === '1';
  
  // Extract slug from cookie OR from URL path /c/SLUG/TOKEN
  let slug = cookies.candidateSlug;
  if (!slug) {
    const pathMatch = window.location.pathname.match(/^\/c\/([^\/]+)\//);
    if (pathMatch) {
      slug = pathMatch[1];
      console.log('[SimpleAutoSave] Extracted slug from URL path:', slug);
    }
  }
  
  // Check for edit mode URL parameter (check both iframe and parent window)
  let editMode = false;
  try {
    // Try current window first
    const urlParams = new URLSearchParams(window.location.search);
    editMode = urlParams.get('edit') === '1';
    
    // If in iframe and no edit param, check parent window
    if (!editMode && window.parent && window.parent !== window) {
      const parentParams = new URLSearchParams(window.parent.location.search);
      editMode = parentParams.get('edit') === '1';
      console.log('[SimpleAutoSave] Checked parent window for edit mode:', editMode);
    }
  } catch (e) {
    // Cross-origin iframe - can't access parent, use current window only
    const urlParams = new URLSearchParams(window.location.search);
    editMode = urlParams.get('edit') === '1';
  }
  
  console.log('[SimpleAutoSave] Role - Admin:', isAdmin, 'Manager:', isManager, 'Candidate:', isCandidate, 'Slug:', slug, 'EditMode:', editMode);
  
  let email = null;
  let viewingOnly = false;
  let candidateEmailForViewing = null;
  let answersLoaded = false; // Flag to prevent repeated loads in edit mode
  
  // CRITICAL: Check if user is BOTH admin AND candidate with a slug
  // This happens when admin starts an exam in the same browser - they ARE the candidate owner!
  const isOwnerWithAdminCookie = isCandidate && slug && (isAdmin || isManager);
  
  if (isOwnerWithAdminCookie) {
    // User has both admin AND candidate cookies - they OWN this exam!
    console.log('[SimpleAutoSave] 🎯 OWNER DETECTED - User has both admin AND candidate cookies');
    console.log('[SimpleAutoSave] Treating as CANDIDATE (not admin viewer) - slug:', slug);
    
    // Get their email from the slug (authoritative source)
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/public/slug/' + encodeURIComponent(slug) + '/info', false);
    try {
      xhr.send();
      if (xhr.status === 200) {
        const info = JSON.parse(xhr.responseText);
        email = info.email;
        viewingOnly = false; // They can edit - they own it!
        console.log('[SimpleAutoSave] ✅ OWNER MODE - Can edit, email:', email);
        
        // Sync localStorage
        const storedEmail = localStorage.getItem('candidateEmail');
        if (storedEmail !== email) {
          localStorage.setItem('candidateEmail', email);
        }
      }
    } catch (e) {
      console.error('[SimpleAutoSave] Failed to get owner email:', e);
    }
  } else if ((isAdmin || isManager) && !isCandidate) {
    // Pure admin/manager viewing (no candidate cookie) - this is a viewer
    if (slug) {
      console.log('[SimpleAutoSave] Admin/Manager VIEWER - fetching candidate email for slug:', slug);
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/public/slug/' + encodeURIComponent(slug) + '/info', false);
      try {
        xhr.send();
        if (xhr.status === 200) {
          const info = JSON.parse(xhr.responseText);
          candidateEmailForViewing = info.email;
          // Enable editing if ?edit=1 parameter is present
          if (editMode) {
            console.log('[SimpleAutoSave] ✏️ EDIT MODE ENABLED - Admin/Manager can edit for:', candidateEmailForViewing);
            email = candidateEmailForViewing; // Set as active email for saving
            viewingOnly = false; // Allow editing
          } else {
            viewingOnly = true; // Read-only mode
            console.log('[SimpleAutoSave] 👁️ READ-ONLY mode - Admin/Manager viewing candidate:', candidateEmailForViewing);
          }
        } else {
          console.error('[SimpleAutoSave] Failed to get candidate info, status:', xhr.status);
        }
      } catch (e) {
        console.error('[SimpleAutoSave] Failed to get candidate info:', e);
      }
    }
  } else if (isCandidate) {
    // For candidates: If we have a slug cookie, ALWAYS use that (it's authoritative)
    // This fixes issues where localStorage has stale/wrong email
    if (slug) {
      console.log('[SimpleAutoSave] Candidate - fetching authoritative email for slug:', slug);
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/public/slug/' + encodeURIComponent(slug) + '/info', false);
      try {
        xhr.send();
        if (xhr.status === 200) {
          const info = JSON.parse(xhr.responseText);
          email = info.email;
          // Update localStorage to keep it in sync
          const storedEmail = localStorage.getItem('candidateEmail');
          if (storedEmail !== email) {
            console.log('[SimpleAutoSave] Updating localStorage from', storedEmail, 'to', email);
            localStorage.setItem('candidateEmail', email);
          }
          console.log('[SimpleAutoSave] Got authoritative email from API:', email);
        }
      } catch (e) {
        console.error('[SimpleAutoSave] Failed to get email:', e);
      }
    }
    
    // Fallback to localStorage only if no slug cookie (legacy support)
    if (!email) {
      email = localStorage.getItem('candidateEmail');
      console.log('[SimpleAutoSave] Email from localStorage (fallback):', email);
    }
  }
  
  // If still no email and not admin, we have a problem
  if (!email && !viewingOnly && !candidateEmailForViewing) {
    console.error('[SimpleAutoSave] NO EMAIL - Auto-save disabled!');
    // Don't show alert if in iframe
    if (window.self === window.top) {
      alert('⚠️ Auto-save is disabled because email is missing. Please re-login.');
    }
    return;
  }
  
  if (viewingOnly) {
    console.log('[SimpleAutoSave] Running in READ-ONLY mode (admin viewing)');
    console.log('[SimpleAutoSave] Will load answers for:', candidateEmailForViewing);
    // Add visual indicator for read-only mode
    setTimeout(() => {
      const indicator = document.createElement('div');
      indicator.style.cssText = 'position:fixed;top:10px;right:10px;background:#f59e0b;color:white;padding:8px 16px;border-radius:6px;font-weight:600;font-size:13px;z-index:10000;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
      indicator.textContent = '👁️ Viewing as Admin (Read-Only)';
      document.body.appendChild(indicator);
    }, 100);
  }
  
  // Add visual indicator for edit mode
  if ((isAdmin || isManager) && !viewingOnly && editMode) {
    console.log('[SimpleAutoSave] Running in EDIT MODE (admin editing)');
    setTimeout(() => {
      const indicator = document.createElement('div');
      indicator.style.cssText = 'position:fixed;top:10px;right:10px;background:#10b981;color:white;padding:8px 16px;border-radius:6px;font-weight:600;font-size:13px;z-index:10000;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
      indicator.textContent = '✏️ Editing as Admin - Saving to: ' + email;
      document.body.appendChild(indicator);
    }, 100);
  }
  
  // Collect all fields
  function collectFields() {
    const fields = {};
    console.log('[SimpleAutoSave] collectFields() called');
    
    document.querySelectorAll('textarea, input[type="text"]').forEach((el, idx) => {
      const name = el.name || el.id || `field_${idx}`;
      if (el.value) {
        fields[name] = el.value;
      }
    });
    
    // PRIMARY: Check window._ckeditorInstances (where ckeditor-init.js stores them)
    if (window._ckeditorInstances) {
      for (const id in window._ckeditorInstances) {
        const editor = window._ckeditorInstances[id];
        if (editor && editor.getData) {
          try {
            const data = editor.getData();
            if (data) {
              fields[id] = data;
              console.log('[SimpleAutoSave] Collected from _ckeditorInstances:', id);
            }
          } catch (e) {
            console.warn('[SimpleAutoSave] Error getting data from editor:', id, e);
          }
        }
      }
    }
    
    // DIRECT CHECK: Look for editors stored directly as window[id] (task pages use this)
    // E.g., window['editor-diagram'], window['editor-investigation']
    // NOTE: CKEditor replaces original elements, so we check window properties directly
    const editorNames = ['editor-diagram', 'editor-investigation', 'editor-q1', 'editor-q2', 'editor-q3'];
    console.log('[SimpleAutoSave] Checking editor names:', editorNames);
    editorNames.forEach(id => {
      const exists = !!window[id];
      const hasGetData = exists && typeof window[id].getData === 'function';
      console.log('[SimpleAutoSave] Check', id, '- exists:', exists, 'hasGetData:', hasGetData);
      if (exists && hasGetData && !fields[id]) {
        try {
          const data = window[id].getData();
          console.log('[SimpleAutoSave] Got data from', id, '- length:', data ? data.length : 0);
          // Save even if data is empty string - let server handle it
          fields[id] = data || '';
          console.log('[SimpleAutoSave] Collected from window[id] direct:', id);
        } catch (e) {
          console.warn('[SimpleAutoSave] Error getting data from', id, e);
        }
      }
    });
    
    // ALSO check DOM elements that might still exist
    document.querySelectorAll('[id^="editor-"]').forEach(el => {
      const id = el.id;
      if (window[id] && window[id].getData && !fields[id]) {
        try {
          const data = window[id].getData();
          if (data) {
            fields[id] = data;
            console.log('[SimpleAutoSave] Collected from DOM element:', id);
          }
        } catch (e) {
          console.warn('[SimpleAutoSave] Error getting data from', id, e);
        }
      }
    });
    
    // FALLBACK: CKEditor 5 support - check ALL divs with .ck-editor class
    document.querySelectorAll('.ck-editor').forEach(editorContainer => {
      const editableDiv = editorContainer.querySelector('.ck-editor__editable');
      if (editableDiv) {
        const allDivs = document.querySelectorAll('div[id]');
        for (const div of allDivs) {
          const divId = div.id;
          // Check editor_ prefix (some pages use this pattern)
          if (divId && window[`editor_${divId}`]) {
            const editor = window[`editor_${divId}`];
            if (editor && editor.getData && !fields[divId]) {
              fields[divId] = editor.getData();
              console.log('[SimpleAutoSave] Collected CKEditor5 field (editor_ prefix):', divId);
            }
          }
        }
      }
    });
    
    // FALLBACK: Check for editors stored as global variables with any naming pattern
    // CKEditor 5 stores editors as window['editor-name'] with getData() method
    for (const key in window) {
      if (key.startsWith('_') || key === 'CKEDITOR' || key === 'ClassicEditor') continue; // Skip private/reserved
      try {
        const obj = window[key];
        // Check if this looks like a CKEditor 5 instance
        if (obj && typeof obj === 'object' && typeof obj.getData === 'function' && !fields[key]) {
          const data = obj.getData();
          if (data && data.trim()) {
            // Try to get the original element ID
            const sourceElement = obj.sourceElement;
            const fieldName = sourceElement && sourceElement.id ? sourceElement.id : key;
            if (!fields[fieldName]) {
              fields[fieldName] = data;
              console.log('[SimpleAutoSave] Collected CKEditor field (global scan):', fieldName, 'from key:', key);
            }
          }
        }
      } catch (e) {
        // Not a CKEditor instance or error accessing, skip
      }
    }
    
    // Legacy CKEditor 4 support
    if (window.CKEDITOR && window.CKEDITOR.instances) {
      for (const name in window.CKEDITOR.instances) {
        if (!fields[name]) { // Don't overwrite if already collected
          fields[name] = window.CKEDITOR.instances[name].getData();
          console.log('[SimpleAutoSave] Collected CKEditor4 field:', name);
        }
      }
    }
    
    console.log('[SimpleAutoSave] Total fields collected:', Object.keys(fields).length, Object.keys(fields));
    return fields;
  }
  
  // Load saved answers from server
  function loadAnswers() {
    // In edit mode, only load answers ONCE to show previous data
    // Then stop loading to prevent overwrites
    if (editMode && answersLoaded) {
      console.log('[SimpleAutoSave] ✏️ Edit mode - skipping load (already loaded initial answers)');
      return Promise.resolve();
    }
    
    console.log('[SimpleAutoSave] Loading saved answers...');
    
    // Use candidate's email if viewing as admin
    const loadEmail = viewingOnly ? candidateEmailForViewing : email;
    
    if (!loadEmail) {
      console.log('[SimpleAutoSave] No email available for loading');
      return Promise.resolve();
    }
    
    return fetch('/api/candidate/answers?email=' + encodeURIComponent(loadEmail))
      .then(resp => {
        if (resp.ok) {
          return resp.json();
        } else {
          console.log('[SimpleAutoSave] No saved data found or error:', resp.status);
          return null;
        }
      })
      .then(data => {
        console.log('[SimpleAutoSave] API response:', JSON.stringify(data));
        console.log('[SimpleAutoSave] taskId:', taskId, 'answers[taskId]:', data && data.answers ? data.answers[taskId] : 'N/A');
        if (data && data.ok && data.answers && data.answers[taskId]) {
          const taskData = data.answers[taskId];
          console.log('[SimpleAutoSave] taskData:', JSON.stringify(taskData));
          
          // Check if there's actually data to restore
          if (!taskData.fields || Object.keys(taskData.fields).length === 0) {
            console.log('[SimpleAutoSave] No fields data to restore (empty or missing)');
            answersLoaded = true;
            return;
          }
          
          console.log('[SimpleAutoSave] Restoring saved data:', taskData.fields);
          
          // Helper function to restore data to editors
          function restoreToEditors() {
            let restoredCount = 0;
            
            // Restore textarea and input values
            document.querySelectorAll('textarea, input[type="text"]').forEach((el, idx) => {
              const name = el.name || el.id || `field_${idx}`;
              if (taskData.fields && taskData.fields[name]) {
                el.value = taskData.fields[name];
                console.log('[SimpleAutoSave] Restored field:', name);
                restoredCount++;
              }
            });
            
            // PRIMARY: Restore CKEditor 5 content from _ckeditorInstances
            if (window._ckeditorInstances) {
              for (const fieldName in taskData.fields) {
                if (window._ckeditorInstances[fieldName]) {
                  const editor = window._ckeditorInstances[fieldName];
                  if (editor && editor.setData) {
                    editor.setData(taskData.fields[fieldName]);
                    console.log('[SimpleAutoSave] Restored from _ckeditorInstances:', fieldName);
                    restoredCount++;
                  }
                }
              }
            }
            
            // DIRECT: Restore to window[fieldName] (task pages store editors this way)
            // E.g., window['editor-diagram'], window['editor-investigation']
            for (const fieldName in taskData.fields) {
              if (window[fieldName] && window[fieldName].setData && typeof window[fieldName].setData === 'function') {
                try {
                  window[fieldName].setData(taskData.fields[fieldName]);
                  console.log('[SimpleAutoSave] Restored to window[fieldName] direct:', fieldName);
                  restoredCount++;
                } catch (e) {
                  console.warn('[SimpleAutoSave] Error restoring to', fieldName, e);
                }
              }
            }
            
            // FALLBACK: Restore CKEditor 5 content - search for ALL CKEditor instances
            for (const fieldName in taskData.fields) {
              const fieldValue = taskData.fields[fieldName];
              
              // Check if it's stored with editor_ prefix
              if (window[`editor_${fieldName}`] && window[`editor_${fieldName}`].setData) {
                window[`editor_${fieldName}`].setData(fieldValue);
                console.log('[SimpleAutoSave] Restored CKEditor with prefix:', fieldName);
                restoredCount++;
                continue;
              }
            }
            
            // Legacy CKEditor 4 support
            if (window.CKEDITOR && window.CKEDITOR.instances) {
              for (const name in window.CKEDITOR.instances) {
                if (taskData.fields && taskData.fields[name]) {
                  window.CKEDITOR.instances[name].setData(taskData.fields[name]);
                  console.log('[SimpleAutoSave] Restored CKEditor4:', name);
                  restoredCount++;
                }
              }
            }
            
            return restoredCount;
          }
          
          // Try to restore immediately
          let restored = restoreToEditors();
          const expectedFields = Object.keys(taskData.fields).length;
          
          // If not all fields restored, CKEditor might not be ready - retry
          if (restored < expectedFields) {
            console.log('[SimpleAutoSave] Not all fields restored (' + restored + '/' + expectedFields + '), will retry...');
            
            // Retry with increasing delays
            const retryDelays = [200, 500, 1000, 2000, 3000];
            let retryIndex = 0;
            
            function retryRestore() {
              if (retryIndex >= retryDelays.length) {
                console.log('[SimpleAutoSave] Max retries reached, some fields may not be restored');
                return;
              }
              
              setTimeout(() => {
                restored = restoreToEditors();
                console.log('[SimpleAutoSave] Retry ' + (retryIndex + 1) + ' - restored ' + restored + '/' + expectedFields);
                
                if (restored < expectedFields) {
                  retryIndex++;
                  retryRestore();
                } else {
                  console.log('[SimpleAutoSave] ✅ All fields restored successfully');
                  showBadge('Data loaded ✓', '#10b981');
                }
              }, retryDelays[retryIndex]);
            }
            
            retryRestore();
          } else {
            console.log('[SimpleAutoSave] ✅ All fields restored on first try');
            showBadge('Data loaded ✓', '#10b981');
          }
          
          answersLoaded = true; // Mark as loaded
        } else {
          console.log('[SimpleAutoSave] No previous data to restore');
          answersLoaded = true; // Mark as attempted
        }
      })
      .catch(err => {
        console.error('[SimpleAutoSave] Failed to load answers:', err);
        answersLoaded = true; // Mark as attempted even on error
      });
  }
  
  // Save to server
  function saveNow() {
    if (viewingOnly) {
      console.log('[SimpleAutoSave] Skip save (view-only mode)');
      return;
    }
    
    // Determine which email to use for saving
    const saveEmail = email || candidateEmailForViewing;
    
    // Ensure we have email
    if (!saveEmail) {
      console.error('[SimpleAutoSave] ✗ Cannot save - no email! email:', email, 'candidateEmailForViewing:', candidateEmailForViewing);
      showBadge('No email - cannot save', '#ef4444');
      return;
    }
    
    const fields = collectFields();
    
    // Check if there are any fields collected (not checking content - empty fields are valid)
    if (Object.keys(fields).length === 0) {
      console.log('[SimpleAutoSave] No fields collected - nothing to save');
      return;
    }
    
    // Log what we're saving
    const hasContent = Object.values(fields).some(v => v && String(v).trim());
    console.log('[SimpleAutoSave] Saving...', {email: saveEmail, taskId, fieldCount: Object.keys(fields).length, hasContent, editMode, candidateEmailForViewing});
    console.log('[SimpleAutoSave] DEBUG fields object:', JSON.stringify(fields).substring(0, 500));
    
    fetch('/api/candidate/answers', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: saveEmail, taskId, fields})
    })
    .then(resp => {
      if (resp.ok) {
        console.log('[SimpleAutoSave] ✓ SAVED to:', saveEmail);
        showBadge('Saved ✓', '#10b981');
        return resp.json();
      } else {
        return resp.text().then(txt => {
          console.error('[SimpleAutoSave] ✗ FAILED:', resp.status, 'Email:', saveEmail, 'Response:', txt);
          const errorMsg = txt ? JSON.parse(txt).error : `HTTP ${resp.status}`;
          showBadge('Save failed: ' + errorMsg, '#ef4444');
        });
      }
    })
    .catch(err => {
      console.error('[SimpleAutoSave] ✗ ERROR:', err.message, 'Email:', saveEmail);
      showBadge('Save error: ' + err.message, '#ef4444');
    });
  }
  
  // Show status badge
  function showBadge(text, color) {
    let badge = document.getElementById('saveBadge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'saveBadge';
      badge.style.cssText = 'position:fixed;bottom:12px;right:12px;background:' + color + ';color:white;padding:8px 16px;font-size:13px;font-weight:600;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:10000;transition:opacity 0.3s;';
      document.body.appendChild(badge);
    }
    badge.textContent = text;
    badge.style.background = color;
    badge.style.opacity = '1';
    clearTimeout(badge.timer);
    badge.timer = setTimeout(() => { badge.style.opacity = '0'; }, 2000);
  }
  
  // Save on input with debounce
  let saveTimer = null;
  function onInput() {
    showBadge('Typing...', '#6b7280');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 1000); // Save 1 second after typing stops
  }
  
  // Attach listeners
  function attachListeners() {
    console.log('[SimpleAutoSave] attachListeners() called - viewingOnly:', viewingOnly, 'editMode:', editMode);
    
    // Make editors read-only for admin viewing
    if (viewingOnly) {
      console.log('[SimpleAutoSave] Applying read-only mode...');
      
      // Disable all text inputs and textareas
      document.querySelectorAll('textarea, input[type="text"], input[type="email"], input[type="number"], input[type="search"]').forEach(el => {
        el.setAttribute('readonly', 'readonly');
        el.setAttribute('disabled', 'disabled');
        el.style.opacity = '0.7';
        el.style.cursor = 'not-allowed';
        el.style.backgroundColor = '#f3f4f6';
        el.style.pointerEvents = 'none';
      });
      
      // Disable ONLY save progress buttons, NOT navigation buttons
      document.querySelectorAll('button.save-progress-btn, button[onclick*="saveTask"], button[onclick*="saveDraft"]').forEach(btn => {
        btn.setAttribute('disabled', 'disabled');
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.style.pointerEvents = 'none';
      });
      
      // Disable CKEditor 5 editing - check ALL CKEditor instances
      for (const key in window) {
        const obj = window[key];
        if (obj && typeof obj === 'object' && obj.enableReadOnlyMode && typeof obj.enableReadOnlyMode === 'function') {
          try {
            obj.enableReadOnlyMode('admin-viewing');
            const sourceElement = obj.sourceElement;
            const editorName = sourceElement && sourceElement.id ? sourceElement.id : key;
            console.log('[SimpleAutoSave] Set CKEditor5 to read-only:', editorName);
          } catch (e) {
            // Not a CKEditor instance, skip
          }
        }
      }
      
      // Disable contenteditable elements
      document.querySelectorAll('[contenteditable="true"]').forEach(el => {
        el.setAttribute('contenteditable', 'false');
        el.style.opacity = '0.7';
        el.style.cursor = 'not-allowed';
      });
      
      // Add CSS to prevent any editing
      const style = document.createElement('style');
      style.textContent = `
        .ck-editor__editable { 
          pointer-events: none !important; 
          opacity: 0.7 !important;
          background-color: #f3f4f6 !important;
        }
        .ck-toolbar { 
          pointer-events: none !important; 
          opacity: 0.5 !important; 
        }
      `;
      document.head.appendChild(style);
      
      return; // Don't attach change listeners in read-only mode
    } else if (editMode) {
      // ENABLE editing for edit mode (admin editing)
      console.log('[SimpleAutoSave] ✏️ Enabling edit mode - re-enabling all editors...');
      
      // Re-enable text inputs and textareas
      document.querySelectorAll('textarea, input[type="text"], input[type="email"], input[type="number"], input[type="search"]').forEach(el => {
        el.removeAttribute('readonly');
        el.removeAttribute('disabled');
        el.style.opacity = '1';
        el.style.cursor = 'text';
        el.style.backgroundColor = '';
        el.style.pointerEvents = 'auto';
      });
      
      // Re-enable save buttons
      document.querySelectorAll('button.save-progress-btn, button[onclick*="saveTask"], button[onclick*="saveDraft"]').forEach(btn => {
        btn.removeAttribute('disabled');
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.style.pointerEvents = 'auto';
      });
      
      // ENABLE CKEditor 5 - disable read-only mode
      for (const key in window) {
        const obj = window[key];
        if (obj && typeof obj === 'object' && obj.disableReadOnlyMode && typeof obj.disableReadOnlyMode === 'function') {
          try {
            obj.disableReadOnlyMode('admin-viewing');
            const sourceElement = obj.sourceElement;
            const editorName = sourceElement && sourceElement.id ? sourceElement.id : key;
            console.log('[SimpleAutoSave] ✏️ Enabled CKEditor5 for editing:', editorName);
          } catch (e) {
            console.log('[SimpleAutoSave] Could not enable editor:', e.message);
          }
        }
      }
      
      // Re-enable contenteditable elements
      document.querySelectorAll('[contenteditable="false"]').forEach(el => {
        el.setAttribute('contenteditable', 'true');
        el.style.opacity = '1';
        el.style.cursor = 'text';
      });
      
      // Remove read-only CSS restrictions
      const readOnlyStyles = document.querySelectorAll('style');
      readOnlyStyles.forEach(style => {
        if (style.textContent.includes('.ck-editor__editable')) {
          style.remove();
        }
      });
    }
    
    document.querySelectorAll('textarea, input[type="text"]').forEach(el => {
      el.removeEventListener('input', onInput);
      el.addEventListener('input', onInput);
    });
    
    // CKEditor 5 support - attach to ALL CKEditor instances
    for (const key in window) {
      const obj = window[key];
      if (obj && typeof obj === 'object' && obj.model && obj.model.document && !obj._autoSaveAttached) {
        try {
          obj.model.document.on('change:data', onInput);
          obj._autoSaveAttached = true;
          const sourceElement = obj.sourceElement;
          const editorName = sourceElement && sourceElement.id ? sourceElement.id : key;
          console.log('[SimpleAutoSave] Attached listener to CKEditor5:', editorName);
        } catch (e) {
          // Not a CKEditor instance, skip
        }
      }
    }
    
    // FALLBACK: Attach to contenteditable elements directly (in case CKEditor events don't fire)
    document.querySelectorAll('.ck-editor__editable, [contenteditable="true"]').forEach(el => {
      if (!el._autoSaveInputAttached) {
        el.addEventListener('input', onInput);
        el.addEventListener('keyup', onInput);
        el._autoSaveInputAttached = true;
        console.log('[SimpleAutoSave] Attached fallback input listener to contenteditable');
      }
    });
    
    // Legacy CKEditor 4 support
    if (window.CKEDITOR && window.CKEDITOR.instances) {
      for (const name in window.CKEDITOR.instances) {
        if (!window.CKEDITOR.instances[name]._autoSaveAttached) {
          window.CKEDITOR.instances[name].on('change', onInput);
          window.CKEDITOR.instances[name]._autoSaveAttached = true;
        }
      }
    }
  }
  
  // Setup real-time viewing for admins
  function setupRealtimeViewing() {
    // Check if admin or just viewing
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      if (key) acc[key] = value;
      return acc;
    }, {});
    
    const isAdmin = cookies.admin === '1';
    const slug = cookies.candidateSlug;
    
    if (typeof io !== 'undefined' && slug) {
      console.log('[SimpleAutoSave] Setting up Socket.IO for real-time updates (slug:', slug, ', admin:', isAdmin, ')');
      const socket = io({ query: { sessionId: slug } });
      
      // Listen for session updates (answer-saved events)
      socket.on('sessionUpdate', (update) => {
        console.log('[SimpleAutoSave] Received sessionUpdate:', update);
        
        // SKIP reload if in edit mode (admin is editing)
        if (editMode) {
          console.log('[SimpleAutoSave] ✏️ Ignoring sessionUpdate in edit mode');
          return;
        }
        
        // Check if this is an answer-saved event for our task
        if (update.eventType === 'answer-saved' && update.data && update.data.taskId === taskId) {
          console.log('[SimpleAutoSave] Reloading answers due to remote update...');
          
          // Small delay to let server finish writing
          setTimeout(() => {
            loadAnswers().then(() => {
              console.log('[SimpleAutoSave] ✓ Refreshed from remote update');
              
              // Show visual indicator
              showUpdateIndicator();
            });
          }, 200);
        }
      });
      
      socket.on('connect', () => {
        console.log('[SimpleAutoSave] Socket.IO connected');
      });
      
      socket.on('connected', (data) => {
        console.log('[SimpleAutoSave] Joined session room:', data);
      });
      
      socket.on('disconnect', () => {
        console.log('[SimpleAutoSave] Socket.IO disconnected');
      });
    } else {
      console.log('[SimpleAutoSave] Socket.IO not available or no slug');
    }
  }
  
  // Listen for refresh requests from parent (monitor page)
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'refresh') {
      // SKIP reload if in edit mode (admin is editing)
      if (editMode) {
        console.log('[SimpleAutoSave] ✏️ Ignoring refresh request in edit mode');
        return;
      }
      console.log('[SimpleAutoSave] Refresh requested from parent');
      loadAnswers();
    }
  });
  
  // Show visual indicator for updates (admin view)
  function showUpdateIndicator() {
    let indicator = document.getElementById('update-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'update-indicator';
      indicator.style.cssText = 'position:fixed;top:20px;right:20px;background:#10b981;color:white;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;box-shadow:0 4px 12px rgba(16,185,129,0.4);z-index:10000;animation:slideIn 0.3s ease;';
      indicator.textContent = '✓ Updated';
      document.body.appendChild(indicator);
      
      // Add animation
      const style = document.createElement('style');
      style.textContent = '@keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }';
      document.head.appendChild(style);
    }
    
    indicator.style.display = 'block';
    
    // Hide after 2 seconds
    setTimeout(() => {
      indicator.style.display = 'none';
    }, 2000);
  }
  
  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Wait for CKEditor to initialize before attaching listeners
      setTimeout(() => {
        attachListeners();
        // Try re-attaching after another delay in case editors load late
        setTimeout(attachListeners, 2000);
      }, 1000);
      // Load saved data after CKEditor should be ready
      // In edit mode: load ONCE to show previous answers, then stop auto-loading
      setTimeout(loadAnswers, 1500);
      
      // Setup real-time viewing (SKIP if edit mode - would overwrite admin's edits)
      if (!editMode) {
        setTimeout(setupRealtimeViewing, 2000);
      } else {
        console.log('[SimpleAutoSave] ✏️ Edit mode - skipping real-time updates');
      }
    });
  } else {
    attachListeners();
    // Load saved data after a short delay (let CKEditor initialize first)
    setTimeout(loadAnswers, 500);
    // Setup real-time viewing (SKIP if edit mode)
    if (!editMode) {
      setTimeout(setupRealtimeViewing, 1000);
    } else {
      console.log('[SimpleAutoSave] ✏️ Edit mode - skipping real-time updates');
    }
  }
  
  // Re-attach every 30 seconds for dynamic content (reduced from 5 seconds for performance)
  setInterval(attachListeners, 30000);
  
  // Listen for editorsReady event (for pages that initialize editors after load)
  window.addEventListener('editorsReady', () => {
    console.log('[SimpleAutoSave] Editors ready event received - re-attaching listeners');
    setTimeout(() => {
      attachListeners();
      // SKIP reload if in edit mode (admin is editing)
      if (!editMode) {
        loadAnswers();
      } else {
        console.log('[SimpleAutoSave] ✏️ Skipping loadAnswers in edit mode');
      }
    }, 100);
  });
  
  // Expose attachListeners for manual triggering
  window.attachAutoSaveListeners = attachListeners;
  
  // Save on page unload - ALWAYS
  window.addEventListener('beforeunload', () => {
    const fields = collectFields();
    const hasContent = Object.values(fields).some(v => v && String(v).trim());
    
    if (hasContent && email) {
      console.log('[SimpleAutoSave] Saving on page unload...');
      
      // Try beacon
      try {
        navigator.sendBeacon('/api/candidate/answers', new Blob([JSON.stringify({email, taskId, fields})], {type: 'application/json'}));
        console.log('[SimpleAutoSave] ✓ Sent via beacon');
      } catch (e) {
        // Fallback to sync XHR
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/candidate/answers', false);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.send(JSON.stringify({email, taskId, fields}));
          console.log('[SimpleAutoSave] ✓ Sent via XHR');
        } catch (err) {
          console.error('[SimpleAutoSave] ✗ Failed to save on unload:', err);
        }
      }
    }
  });
  
  // Initial save after 2 seconds (in case there's already content)
  setTimeout(() => {
    const fields = collectFields();
    const hasContent = Object.values(fields).some(v => v && String(v).trim());
    if (hasContent) {
      console.log('[SimpleAutoSave] Initial save of existing content...');
      saveNow();
    }
  }, 2000);
  
  console.log('[SimpleAutoSave] ✓ Initialized successfully');
})();
