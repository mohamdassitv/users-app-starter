#!/bin/sh
set -e

# Ensure /app/lab/state directory exists
mkdir -p /app/lab/state

# If /app/state/state.json exists and is not a symlink, move it to mounted volume
if [ -f /app/state/state.json ] && [ ! -L /app/state/state.json ]; then
  echo "Moving state.json to persistent volume..."
  cp /app/state/state.json /app/lab/state/state.json 2>/dev/null || true
  rm -f /app/state/state.json
fi

# Create symlink from /app/state/state.json to /app/lab/state/state.json
if [ ! -L /app/state/state.json ]; then
  echo "Creating symlink for state.json..."
  ln -sf /app/lab/state/state.json /app/state/state.json
fi

# Seed state directory if empty (first run of named volume)
if [ -d /seed-state ] && [ ! -f /app/lab/state/state.json ]; then
  echo "Seeding initial state into named volume..."
  cp -R /seed-state/* /app/lab/state/ || true
fi

exec node src/server.js
