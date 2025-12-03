#!/usr/bin/env bash
set -euo pipefail

function ok()  { echo -e "\xE2\x9C\x85 $*"; }
function bad() { echo -e "\xE2\x9D\x8C $*"; exit 1; }

# ensure running
docker compose ps >/dev/null 2>&1 || bad "Run 'make up' first to start the lab."

echo "🔎 Checking router IPv4 forwarding..."
fw=$(docker compose exec -T router sh -c 'cat /proc/sys/net/ipv4/ip_forward' | tr -d '\r')
if [ "$fw" = "1" ]; then ok "router: IPv4 forwarding is ON"; else bad "router: IPv4 forwarding is OFF"; fi

echo "🔎 Testing connectivity leaf-01 ➜ leaf-02..."
if docker compose exec -T leaf01 sh -c 'ping -c 1 -W 1 10.0.0.20 >/dev/null 2>&1'; then
  ok "leaf-01 can reach leaf-02"
else
  bad "leaf-01 cannot reach leaf-02"
fi

echo "🔎 Testing connectivity leaf-02 ➜ leaf-01..."
if docker compose exec -T leaf02 sh -c 'ping -c 1 -W 1 192.168.178.10 >/dev/null 2>&1'; then
  ok "leaf-02 can reach leaf-01"
else
  bad "leaf-02 cannot reach leaf-01"
fi

ok "All checks passed! 🎉"
