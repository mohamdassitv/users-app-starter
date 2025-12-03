#!/bin/sh
set -eu
whoami
node="$1"

# Install socat for web terminal support
apk add --no-cache socat 2>/dev/null || true

# Wait a moment for networking to be ready
sleep 0.2

if [ "$node" = "leaf01" ] || [ "$node" = "leaf02" ]; then
  ip route del default 2>/dev/null || true
  echo "[seed] default route removed on $node"
elif [ "$node" = "router" ]; then
  echo 0 > /proc/sys/net/ipv4/ip_forward
  echo "[seed] ip_forward set to 0 on router"
fi
