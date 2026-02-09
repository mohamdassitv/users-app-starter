#!/bin/sh
set -eu
# Disable IP forwarding by default - candidate must enable it
echo 0 > /proc/sys/net/ipv4/ip_forward
echo "router initialized - IP forwarding is DISABLED"
cat /proc/sys/net/ipv4/ip_forward
