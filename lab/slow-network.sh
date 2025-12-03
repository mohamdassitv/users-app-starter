#!/bin/sh
# Simulates slow network by adding delay to Osaka branch
# This script demonstrates network degradation

echo "Applying network delay to Osaka branch..."
tc qdisc add dev eth0 root netem delay 200ms 40ms loss 12%
if [ $? -eq 0 ]; then
    echo "✓ Network delay applied: 200ms ±40ms, 12% packet loss"
    tc qdisc show dev eth0
else
    echo "✗ Failed to apply network delay (requires kernel support)"
fi
