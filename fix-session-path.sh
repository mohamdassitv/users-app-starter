#!/bin/bash
# Fix session-manager to use persistent mounted path

# Update STATE_ROOT to use /app/lab/state/sessions (mounted volume)
sed -i "s|path.join(__dirname, '..', 'state', 'sessions')|path.join(__dirname, '..', 'lab', 'state', 'sessions')|" /app/src/session-manager.js

# Verify the change
echo "Updated STATE_ROOT:"
grep "STATE_ROOT" /app/src/session-manager.js | head -1

# Copy existing sessions if needed
if [ -d "/app/state/sessions" ] && [ "$(ls -A /app/state/sessions 2>/dev/null)" ]; then
    echo "Copying existing sessions to persistent storage..."
    cp -rn /app/state/sessions/* /app/lab/state/sessions/ 2>/dev/null || true
fi

echo "Sessions now stored in: /app/lab/state/sessions/"
ls /app/lab/state/sessions/ | wc -l
echo "session folders"
