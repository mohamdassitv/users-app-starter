#!/bin/sh
set -e
# Seed state directory if empty (first run of named volume)
if [ -d /seed-state ] && [ ! -f /app/state/state.json ]; then
  echo "Seeding initial state into named volume..."
  cp -R /seed-state/* /app/state/ || true
fi
exec node src/server.js
