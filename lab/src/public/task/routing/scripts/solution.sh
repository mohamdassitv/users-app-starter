#!/bin/sh
set -eu
echo "[solution] configuring leaf01..."
docker compose exec -T leaf01 sh -c 'ip route del default 2>/dev/null || true; ip route add default via 192.168.178.2'
echo "[solution] configuring leaf02..."
docker compose exec -T leaf02 sh -c 'ip route del default 2>/dev/null || true; ip route add default via 10.0.0.2'
echo "[solution] enabling ip_forward on router..."
docker compose exec -T router sh -c 'echo 1 > /proc/sys/net/ipv4/ip_forward'
echo "[solution] done."
