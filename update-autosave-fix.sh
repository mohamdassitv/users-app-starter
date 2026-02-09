#!/bin/bash
# Quick update script to fix simple-autosave.js on EC2
# Run this on your EC2 instance via AWS Console EC2 Instance Connect

set -e

echo "========================================="
echo "🔧 Updating simple-autosave.js"
echo "========================================="

# Get the container ID
CONTAINER_ID=$(docker ps --filter "name=app" --format "{{.ID}}" | head -n 1)

if [ -z "$CONTAINER_ID" ]; then
    echo "❌ No running container found with name 'app'"
    echo "Available containers:"
    docker ps
    exit 1
fi

echo "✅ Found container: $CONTAINER_ID"
echo ""

# Backup the current file
echo "📦 Creating backup..."
docker exec $CONTAINER_ID cp /app/lab/src/public/simple-autosave.js /app/lab/src/public/simple-autosave.js.backup
echo "✅ Backup created"
echo ""

# Create the updated file
echo "📝 Creating updated file..."
docker exec $CONTAINER_ID bash -c 'cat > /app/lab/src/public/simple-autosave.js << '\''EOFILE'\''
// SIMPLE AUTO-SAVE - No complex async, just save immediately
(function() {
  const taskId = (document.currentScript && document.currentScript.getAttribute('\''data-task-id'\'')) 
    || document.body.getAttribute('\''data-task-id'\'') 
    || '\''unknown'\'';
  
  console.log('\''[SimpleAutoSave] Starting for task:'\'', taskId);
  
  // Parse cookies first
  const cookies = document.cookie.split('\'';'\'').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('\''='\'');
    if (key) acc[key] = value;
    return acc;
  }, {});
  
  const isAdmin = cookies.admin === '\''1'\'';
  const isManager = cookies.manager === '\''1'\'';
  const isCandidate = cookies.candidate === '\''1'\'';
  const slug = cookies.candidateSlug;
  
  console.log('\''[SimpleAutoSave] Role - Admin:'\'', isAdmin, '\''Manager:'\'', isManager, '\''Candidate:'\'', isCandidate, '\''Slug:'\'', slug);
  
  let email = null;
  let viewingOnly = false;
  let candidateEmailForViewing = null;
  
  // If admin/manager viewing, ALWAYS get the candidate'\''s email from slug (ignore localStorage)
  if (isAdmin || isManager) {
    if (slug) {
      console.log('\''[SimpleAutoSave] Admin/Manager - fetching candidate email for slug:'\'', slug);
      const xhr = new XMLHttpRequest();
      xhr.open('\''GET'\'', '\''/public/slug/'\'' + encodeURIComponent(slug) + '\''/info'\'', false);
      try {
        xhr.send();
        if (xhr.status === 200) {
          const info = JSON.parse(xhr.responseText);
          candidateEmailForViewing = info.email;
          viewingOnly = true;
          console.log('\''[SimpleAutoSave] Admin/Manager viewing candidate:'\'', candidateEmailForViewing);
        } else {
          console.error('\''[SimpleAutoSave] Failed to get candidate info, status:'\'', xhr.status);
        }
      } catch (e) {
        console.error('\''[SimpleAutoSave] Failed to get candidate info:'\'', e);
      }
    }
  } else {
    // For candidates: If we have a slug cookie, ALWAYS use that (it'\''s authoritative)
    // This fixes issues where localStorage has stale/wrong email
    if (slug) {
      console.log('\''[SimpleAutoSave] Candidate - fetching authoritative email for slug:'\'', slug);
      const xhr = new XMLHttpRequest();
      xhr.open('\''GET'\'', '\''/public/slug/'\'' + encodeURIComponent(slug) + '\''/info'\'', false);
      try {
        xhr.send();
        if (xhr.status === 200) {
          const info = JSON.parse(xhr.responseText);
          email = info.email;
          // Update localStorage to keep it in sync
          const storedEmail = localStorage.getItem('\''candidateEmail'\'');
          if (storedEmail !== email) {
            console.log('\''[SimpleAutoSave] Updating localStorage from'\'', storedEmail, '\''to'\'', email);
            localStorage.setItem('\''candidateEmail'\'', email);
          }
          console.log('\''[SimpleAutoSave] Got authoritative email from API:'\'', email);
        }
      } catch (e) {
        console.error('\''[SimpleAutoSave] Failed to get email:'\'', e);
      }
    }
    
    // Fallback to localStorage only if no slug cookie (legacy support)
    if (!email) {
      email = localStorage.getItem('\''candidateEmail'\'');
      console.log('\''[SimpleAutoSave] Email from localStorage (fallback):'\'', email);
    }
  }
EOFILE'

echo "✅ File updated successfully"
echo ""

# Verify the update
echo "🔍 Verifying update..."
docker exec $CONTAINER_ID grep -A 5 "Updating localStorage from" /app/lab/src/public/simple-autosave.js

echo ""
echo "========================================="
echo "✅ Update Complete!"
echo "========================================="
echo ""
echo "📌 Changes made:"
echo "   - Fixed email resolution to use slug as authoritative source"
echo "   - Manager monitor will now load correct candidate data"
echo "   - LocalStorage mismatches will be automatically fixed"
echo ""
echo "🔄 The changes are live immediately (no restart needed)"
echo ""
echo "📋 To verify:"
echo "   1. Refresh your browser"
echo "   2. Check the browser console for:"
echo "      '[SimpleAutoSave] Got authoritative email from API:'"
echo ""
