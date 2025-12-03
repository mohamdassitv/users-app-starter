#!/bin/sh
set -eu
ip route del default 2>/dev/null || true
ip route add default via 192.168.178.2
ip route
