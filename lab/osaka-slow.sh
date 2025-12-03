#!/bin/sh
# Network slowdown simulator for Osaka branch
# Wraps common network commands with artificial delays

# Create wrapper scripts that add delays
cat > /usr/local/bin/curl << 'EOF'
#!/bin/sh
sleep $(awk 'BEGIN{srand(); print rand()*0.4 + 0.3}')
/usr/bin/curl "$@"
EOF

cat > /usr/local/bin/ping << 'EOF'
#!/bin/sh
# Modify ping output to show increased RTT times
/bin/ping "$@" | awk '
/^64 bytes/ {
  if (match($0, /time=([0-9.]+)/, arr)) {
    original_time = arr[1]
    new_time = original_time + 150 + (rand() * 100)
    sub(/time=[0-9.]+/, sprintf("time=%.2f", new_time))
  }
  print; fflush()
  next
}
/^--- .* ping statistics ---$/ {
  print; fflush()
  getline
  # Adjust the average RTT in summary
  if (match($0, /rtt min\/avg\/max\/mdev = ([0-9.]+)\/([0-9.]+)\/([0-9.]+)\/([0-9.]+)/, arr)) {
    min_rtt = arr[1] + 150
    avg_rtt = arr[2] + 180
    max_rtt = arr[3] + 220
    mdev = arr[4] + 30
    sub(/rtt min\/avg\/max\/mdev = [0-9.\/]+/, sprintf("rtt min/avg/max/mdev = %.3f/%.3f/%.3f/%.3f", min_rtt, avg_rtt, max_rtt, mdev))
  }
  print; fflush()
  next
}
{ print; fflush() }
'
EOF

cat > /usr/local/bin/dig << 'EOF'
#!/bin/sh
sleep $(awk 'BEGIN{srand(); print rand()*0.3 + 0.2}')
/usr/bin/dig "$@" | awk '
/Query time:/ {
  if (match($0, /Query time: ([0-9]+)/, arr)) {
    original_time = arr[1]
    new_time = original_time + 150 + int(rand() * 100)
    sub(/Query time: [0-9]+/, sprintf("Query time: %d", new_time))
  }
}
{ print }
'
EOF

cat > /usr/local/bin/traceroute << 'EOF'
#!/bin/sh
sleep 0.4
/usr/bin/traceroute "$@"
EOF

# Make wrappers executable
chmod +x /usr/local/bin/curl /usr/local/bin/ping /usr/local/bin/dig /usr/local/bin/traceroute

echo "✓ Network slowdown simulation active for Osaka branch"
echo "  - curl: +300-700ms delay"
echo "  - ping: +150-250ms RTT increase"
echo "  - dig: +150-250ms query time"
echo "  - traceroute: +400ms delay"
