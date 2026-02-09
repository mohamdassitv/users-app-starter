#!/bin/sh
set -eu
# Remove any default route to ensure network is unreachable initially
ip route del default 2>/dev/null || true
echo "leaf-01 initialized - no default route configured"
ip route show
