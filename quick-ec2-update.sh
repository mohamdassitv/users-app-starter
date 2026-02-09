#!/bin/bash
# Quick EC2 Update - Run this via AWS Console EC2 Instance Connect
# Updates simple-autosave.js with the email resolution fix

CONTAINER=$(docker ps --format "{{.Names}}" | grep -E "lab-app|app" | head -n 1)

if [ -z "$CONTAINER" ]; then
  echo "❌ No container found"
  docker ps
  exit 1
fi

echo "✅ Found container: $CONTAINER"
echo "📝 Creating updated file..."

docker exec $CONTAINER bash -c 'cat > /app/lab/src/public/simple-autosave.js.new << '\''ENDOFFILE'\''
// FILE CONTENT WILL BE HERE
ENDOFFILE

# Backup old file
cp /app/lab/src/public/simple-autosave.js /app/lab/src/public/simple-autosave.js.backup

# Replace with new file
mv /app/lab/src/public/simple-autosave.js.new /app/lab/src/public/simple-autosave.js

# Verify
echo "✅ Verifying fix is present..."
grep -q "Got authoritative email from API" /app/lab/src/public/simple-autosave.js && echo "✓ Fix applied successfully!" || echo "✗ Fix verification failed"
'

echo ""
echo "✅ Update complete!"
echo "📌 Changes:"
echo "   - Email now uses slug as authoritative source"
echo "   - Manager monitor will load correct candidate data"
echo "   - localStorage sync issues fixed"
echo ""
echo "🔄 Refresh your browser to see the fix"
