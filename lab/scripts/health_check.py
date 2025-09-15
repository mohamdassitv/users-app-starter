#!/usr/bin/env python3
# health_check.py - sample skeleton (python + requests-like using urllib)
import json, time, urllib.request

HOST = "http://localhost:8081"

def measure(url, n=3):
    times = []
    for _ in range(n):
        t0 = time.time()
        with urllib.request.urlopen(url) as resp:
            resp.read()
        times.append((time.time()-t0)*1000.0)
    return int(sum(times)/len(times))

avg = measure(f"{HOST}/gateway/delay/800", n=3)

# status code for /gateway/ok
req = urllib.request.Request(f"{HOST}/gateway/ok")
with urllib.request.urlopen(req) as resp:
    status = resp.getcode()

payload = {"dns_ok": True, "https_ok": True, "avg_latency_ms": avg, "vip_status": status}

# submit
req = urllib.request.Request(f"{HOST}/submit/health",
                             data=json.dumps(payload).encode("utf-8"),
                             headers={"Content-Type":"application/json"},
                             method="POST")
with urllib.request.urlopen(req) as resp:
    print(resp.read().decode())
