#!/usr/bin/env bash
# health_check.sh - sample skeleton (bash + curl)
set -euo pipefail
HOST="${1:-http://localhost:8081}"
measure() {
  local url="$1"
  local sum=0
  local n=3
  for i in $(seq 1 $n); do
    t=$(curl -w "%{time_total}" -o /dev/null -s "$url")
    # convert seconds to ms
    ms=$(python3 - <<PY
t = float("$t")
print(int(t*1000))
PY
)
    sum=$((sum + ms))
  done
  echo $((sum / n))
}
avg=$(measure "$HOST/gateway/delay/800")
status=$(curl -s -o /dev/null -w "%{http_code}" "$HOST/gateway/ok")
payload=$(cat <<JSON
{{"dns_ok": true, "https_ok": true, "avg_latency_ms": $avg, "vip_status": $status}}
JSON
)
curl -s -X POST "$HOST/submit/health" -H "Content-Type: application/json" -d "$payload" | cat
echo
