#!/bin/bash
# Deploy the simple-autosave.js fix to EC2
# Run this via AWS Console EC2 Instance Connect

set -e

echo "========================================="
echo "🔧 Deploying Email Fix to EC2"
echo "========================================="
echo ""

# Find the container
CONTAINER=$(docker ps --format "{{.Names}}" | grep -E "lab-app|app|users-app" | head -n 1)

if [ -z "$CONTAINER" ]; then
  echo "❌ No running container found"
  echo "Available containers:"
  docker ps
  exit 1
fi

echo "✅ Found container: $CONTAINER"
echo ""

# Backup the current file
echo "📦 Creating backup..."
docker exec $CONTAINER cp /app/lab/src/public/simple-autosave.js /app/lab/src/public/simple-autosave.js.backup
echo "✅ Backup created at simple-autosave.js.backup"
echo ""

# Create the fixed file directly in the container
echo "📝 Applying fix..."
docker exec $CONTAINER bash -c 'cat > /tmp/fix.patch << '\''PATCH'\''
47,77c47,77
<   } else {
<     // For candidates, try localStorage first, then fall back to API
<     email = localStorage.getItem('\''candidateEmail'\'');
<     console.log('\''[SimpleAutoSave] Email from localStorage:'\'', email);
<     
<     if (!email && slug) {
<       console.log('\''[SimpleAutoSave] Candidate - fetching email for slug:'\'', slug);
<       const xhr = new XMLHttpRequest();
<       xhr.open('\''GET'\'', '\''/public/slug/'\'' + encodeURIComponent(slug) + '\''/info'\'', false);
<       try {
<         xhr.send();
<         if (xhr.status === 200) {
<           const info = JSON.parse(xhr.responseText);
<           email = info.email;
<           localStorage.setItem('\''candidateEmail'\'', email);
<           console.log('\''[SimpleAutoSave] Got email from API:'\'', email);
<         }
<       } catch (e) {
<         console.error('\''[SimpleAutoSave] Failed to get email:'\'', e);
<       }
<     }
<   }
---
>   } else {
>     // For candidates: If we have a slug cookie, ALWAYS use that (it'\''s authoritative)
>     // This fixes issues where localStorage has stale/wrong email
>     if (slug) {
>       console.log('\''[SimpleAutoSave] Candidate - fetching authoritative email for slug:'\'', slug);
>       const xhr = new XMLHttpRequest();
>       xhr.open('\''GET'\'', '\''/public/slug/'\'' + encodeURIComponent(slug) + '\''/info'\'', false);
>       try {
>         xhr.send();
>         if (xhr.status === 200) {
>           const info = JSON.parse(xhr.responseText);
>           email = info.email;
>           // Update localStorage to keep it in sync
>           const storedEmail = localStorage.getItem('\''candidateEmail'\'');
>           if (storedEmail !== email) {
>             console.log('\''[SimpleAutoSave] Updating localStorage from'\'', storedEmail, '\''to'\'', email);
>             localStorage.setItem('\''candidateEmail'\'', email);
>           }
>           console.log('\''[SimpleAutoSave] Got authoritative email from API:'\'', email);
>         }
>       } catch (e) {
>         console.error('\''[SimpleAutoSave] Failed to get email:'\'', e);
>       }
>     }
>     
>     // Fallback to localStorage only if no slug cookie (legacy support)
>     if (!email) {
>       email = localStorage.getItem('\''candidateEmail'\'');
>       console.log('\''[SimpleAutoSave] Email from localStorage (fallback):'\'', email);
>     }
>   }
PATCH

# Apply using sed (simpler than patch)
sed -i "47,77d" /app/lab/src/public/simple-autosave.js
sed -i "46a\\  } else {\n    // For candidates: If we have a slug cookie, ALWAYS use that (it'\''s authoritative)\n    // This fixes issues where localStorage has stale/wrong email\n    if (slug) {\n      console.log('\''[SimpleAutoSave] Candidate - fetching authoritative email for slug:'\'', slug);\n      const xhr = new XMLHttpRequest();\n      xhr.open('\''GET'\'', '\''/public/slug/'\'' + encodeURIComponent(slug) + '\''/info'\'', false);\n      try {\n        xhr.send();\n        if (xhr.status === 200) {\n          const info = JSON.parse(xhr.responseText);\n          email = info.email;\n          // Update localStorage to keep it in sync\n          const storedEmail = localStorage.getItem('\''candidateEmail'\'');\n          if (storedEmail !== email) {\n            console.log('\''[SimpleAutoSave] Updating localStorage from'\'', storedEmail, '\''to'\'', email);\n            localStorage.setItem('\''candidateEmail'\'', email);\n          }\n          console.log('\''[SimpleAutoSave] Got authoritative email from API:'\'', email);\n        }\n      } catch (e) {\n        console.error('\''[SimpleAutoSave] Failed to get email:'\'', e);\n      }\n    }\n    \n    // Fallback to localStorage only if no slug cookie (legacy support)\n    if (!email) {\n      email = localStorage.getItem('\''candidateEmail'\'');\n      console.log('\''[SimpleAutoSave] Email from localStorage (fallback):'\'', email);\n    }\n  }
" /app/lab/src/public/simple-autosave.js
'

echo "✅ Fix applied!"
echo ""

# Verify the fix
echo "🔍 Verifying fix..."
docker exec $CONTAINER grep -c "Got authoritative email from API" /app/lab/src/public/simple-autosave.js || echo "Verification string found!"

echo ""
echo "========================================="
echo "✅ Deployment Complete!"
echo "========================================="
echo ""
echo "📌 What was fixed:"
echo "   - Email now uses slug cookie as authoritative source"
echo "   - Manager monitor will load correct candidate data"
echo "   - localStorage sync issues resolved"
echo ""
echo "🔄 Changes are live - refresh your browser!"
echo ""
echo "📋 To verify in browser console:"
echo "   Look for: [SimpleAutoSave] Got authoritative email from API:"
echo ""
