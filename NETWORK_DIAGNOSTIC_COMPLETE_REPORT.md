# Network Diagnostic Report - Osaka Branch Slowdown
**Date:** 2025-06-14  
**Engineer:** Network Operations  
**Issue:** Osaka branch experiencing significant slowdown accessing cloud services

---

## Executive Summary

Through systematic network diagnostics, we identified that the **Osaka branch EDGE connection** is the root cause of observed latency. Despite all three branches (Osaka, Tokyo, Kyoto) sharing the same upstream path through VC-GW and Harmony components, only Osaka shows degraded performance (~1.8s total time vs ~0.1s for other branches).

**Key Finding:** The delay manifests during the **TCP Connect phase** (~650ms), indicating a **local network or last-mile ISP issue** specific to Osaka's connection, rather than a shared infrastructure problem.

---

## Network Topology Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Internet Cloud                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │        Harmony Gateway (Shared)                        │ │
│  └─────────────────────┬──────────────────────────────────┘ │
│                        │                                     │
│  ┌─────────────────────┴──────────────────────────────────┐ │
│  │        Virtual Cloud Gateway (Shared)                  │ │
│  └───────┬──────────────┬──────────────┬──────────────────┘ │
└──────────┼──────────────┼──────────────┼────────────────────┘
           │              │              │
      ┌────┴────┐    ┌────┴────┐   ┌────┴────┐
      │ Osaka   │    │ Tokyo   │   │ Kyoto   │
      │ EDGE    │    │ EDGE    │   │ EDGE    │
      └────┬────┘    └────┬────┘   └────┬────┘
           │              │              │
      [Osaka LAN]    [Tokyo LAN]   [Kyoto LAN]
```

### Branch Details
- **Osaka:** 10.2.0.0/24 via EDGE router (VC-GW client)
- **Tokyo:** 10.1.0.0/24 via EDGE router (VC-GW client)
- **Kyoto:** 10.3.0.0/24 via EDGE router (VC-GW client)
- **Shared upstream:** All branches → VC-GW → Harmony Gateway → Internet

---

## Diagnostic Approach & Methodology

### Phase 1: Problem Validation
Used `curl` with detailed timing breakdown to measure:
- DNS lookup time
- TCP connection time
- SSL/TLS handshake time
- First byte time (TTFB)
- Total request time

**Command executed from each branch:**
```bash
curl -w "\nDNS:%{time_namelookup} Connect:%{time_connect} StartTransfer:%{time_starttransfer} Total:%{time_total}\n" \
     -o /dev/null -s "https://www.google.com"
```

### Phase 2: Timing Analysis
Compared timing breakdowns across all three branches to identify the specific phase where delay occurs.

### Phase 3: Root Cause Isolation
Used network topology knowledge to determine if the issue was:
- Local (per-branch)
- Shared infrastructure (VC-GW/Harmony)
- External (ISP/Internet backbone)

---

## Test Results

### Raw Timing Data

| Branch | DNS Lookup | TCP Connect | SSL Start Transfer | Total Time |
|--------|-----------|-------------|-------------------|------------|
| **Osaka** | 0.152s | 0.654s | 1.712s | 1.838s |
| **Tokyo** | 0.004s | 0.005s | 0.089s | 0.090s |
| **Kyoto** | 0.004s | 0.006s | 0.125s | 0.127s |

### Visual Performance Comparison

```
Time scale (milliseconds):
0    200   400   600   800   1000  1200  1400  1600  1800
├────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤
Osaka:  [DNS]──[=========== TCP Connect ===========]─[SSL/TLS...]────────────────■ (1838ms)
Tokyo:  [D][C][SSL...■ (90ms)
Kyoto:  [D][C][SSL....■ (127ms)
```

### Key Observations

1. **DNS Resolution:**
   - Osaka: 152ms (higher but acceptable)
   - Tokyo/Kyoto: 4-6ms (normal)
   - *Conclusion:* Minor difference, not the primary issue

2. **TCP Connect Time (CRITICAL):**
   - Osaka: **654ms** ← Main bottleneck
   - Tokyo: 5ms
   - Kyoto: 6ms
   - *Conclusion:* 100x slower in Osaka during connection establishment

3. **SSL/TLS Handshake:**
   - Osaka: 1.058s additional time after connect (1.712s - 0.654s)
   - Tokyo: 84ms additional (0.089s - 0.005s)
   - Kyoto: 119ms additional (0.125s - 0.006s)
   - *Conclusion:* Compounded by initial connection delay

4. **Total Request Time:**
   - Osaka: 1.838s
   - Tokyo: 0.090s (20x faster)
   - Kyoto: 0.127s (14x faster)

---

## Analysis & Findings

### What TCP Connect Time Measures
The TCP Connect phase (`time_connect` in curl) measures the time to complete the **three-way handshake**:
```
Client → SYN → Server
Client ← SYN-ACK ← Server
Client → ACK → Server
```

This is a **round-trip latency test** that reflects:
- Network hop delays
- Router/firewall processing time
- Last-mile connection quality
- Possible congestion or packet loss

### Why Osaka is Different

**Shared Infrastructure Hypothesis (REJECTED):**
- If VC-GW or Harmony were slow, ALL branches would show similar delays
- Tokyo and Kyoto perform normally with the same upstream path
- Therefore, the shared infrastructure is **NOT** the bottleneck

**Local Network Hypothesis (ACCEPTED):**
- Only the **Osaka → VC-GW path** shows degradation
- Possible causes in order of likelihood:
  1. **Osaka EDGE device issues:**
     - CPU overload
     - Interface errors
     - Queuing/buffering problems
     - Firewall rule complexity
  
  2. **Last-mile ISP connection (Osaka specific):**
     - Line quality degradation
     - ISP throttling/congestion
     - Routing inefficiency
     - Distance/hop count to VC-GW POPTime breakdown visualization:
```
OSAKA TIMELINE:
0ms ────> 152ms ─────────────> 654ms ──────────> 1712ms ─> 1838ms
START     DNS lookup complete   TCP connect       SSL done   Response
          [Normal-ish]          [BOTTLENECK!]     [Impacted] received

TOKYO/KYOTO TIMELINE:
0ms > 4-6ms ────> 89-125ms ────> 90-127ms
START DNS done    SSL complete    Response
      [Normal]    [Normal]        received
```

---

## Root Cause Determination

### Primary Issue: Osaka TCP Connect Latency (654ms)

**Diagnosis Logic:**
1. ✅ DNS resolution is acceptable (152ms vs 4-6ms) — not the main issue
2. ❌ **TCP Connect is catastrophically slow (654ms vs 5-6ms)**
3. ✅ SSL/TLS is proportionally delayed due to initial connection lag
4. ✅ Other branches using same VC-GW/Harmony are normal
5. ❌ **Only Osaka local path is affected**

**Conclusion:**  
The bottleneck is in the **Osaka branch's local network segment** or **last-mile ISP connection**, occurring **before** traffic reaches the shared VC-GW infrastructure.

### Most Likely Culprits (Priority Order)

1. **Osaka EDGE Router Performance Issues** (HIGH PROBABILITY)
   - Check CPU/memory utilization
   - Review interface error counters
   - Verify VC-GW client tunnel health
   - Check for high packet drop rates

2. **Osaka ISP Connection Quality** (MEDIUM-HIGH PROBABILITY)
   - Line degradation (especially if DSL/cable)
   - ISP-side congestion or throttling
   - Increased hop count or poor routing to VC-GW POP

3. **Osaka LAN Device Issues** (LOW-MEDIUM PROBABILITY)
   - Rogue device consuming bandwidth
   - Network loop or broadcast storm
   - Failing switch/network equipment

---

## Recommended Actions

### Immediate (Next 24 Hours)
1. **Access Osaka EDGE router diagnostics:**
   ```bash
   # Check CPU and memory
   show system performance
   show processes cpu
   
   # Check interface statistics
   show interfaces
   show interfaces errors
   
   # Check VC-GW tunnel status
   show tunnel statistics
   show vpn status
   ```

2. **Run continuous ping test from Osaka:**
   ```bash
   # Ping VC-GW gateway IP continuously
   ping -c 1000 <VC-GW-IP>
   # Look for packet loss and latency variance
   ```

3. **Check Osaka network health:**
   ```bash
   # From Osaka LAN client
   ping -c 50 10.2.0.1  # EDGE gateway
   traceroute www.google.com
   ```

### Short Term (Next Week)
1. **Contact Osaka ISP** if EDGE router checks are normal
   - Request line quality test
   - Review bandwidth utilization graphs
   - Check for known outages or maintenance

2. **Consider traffic shaping/QoS:**
   - Prioritize critical business traffic
   - Implement bandwidth management

3. **Baseline comparison testing:**
   - Run hourly curl tests throughout the day
   - Identify if slowdown correlates with business hours
   - Check for patterns (time-of-day, day-of-week)

### Long Term (Next Month)
1. **Osaka connection upgrade assessment:**
   - Review current ISP SLA
   - Consider redundant connection (SD-WAN)
   - Evaluate direct connection to VC-GW POP

2. **EDGE router replacement/upgrade:**
   - If current device is underpowered
   - Consider hardware refresh cycle

3. **Network monitoring implementation:**
   - Deploy continuous latency monitoring
   - Set up alerts for performance degradation
   - Create dashboard comparing branch performance

---

## Prevention & Monitoring

### Automated Monitoring Script
Deploy on each branch EDGE or management station:

```bash
#!/bin/bash
# branch-performance-monitor.sh

BRANCH="Osaka"  # Change per branch
VC_GW_IP="<VC-GW-IP>"
LOG_FILE="/var/log/branch-perf.log"

while true; do
  TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
  
  # Ping test
  PING_RESULT=$(ping -c 10 -q $VC_GW_IP | tail -1 | awk -F '/' '{print $5}')
  
  # HTTP test
  CURL_RESULT=$(curl -w "%{time_total}" -o /dev/null -s https://www.google.com)
  
  echo "$TIMESTAMP [$BRANCH] Ping_avg:${PING_RESULT}ms HTTP_total:${CURL_RESULT}s" >> $LOG_FILE
  
  # Alert if total time > 1 second
  if (( $(echo "$CURL_RESULT > 1.0" | bc -l) )); then
    echo "ALERT: High latency detected on $BRANCH!" | mail -s "Network Alert" ops@company.com
  fi
  
  sleep 300  # Test every 5 minutes
done
```

### Alert Thresholds
- **WARNING:** Total HTTP time > 500ms
- **CRITICAL:** Total HTTP time > 1000ms
- **CRITICAL:** Ping average > 200ms
- **EMERGENCY:** Packet loss > 5%

---

## Appendix: Testing Commands Reference

### Basic curl timing test:
```bash
curl -w "\nDNS:%{time_namelookup} Connect:%{time_connect} StartTransfer:%{time_starttransfer} Total:%{time_total}\n" \
     -o /dev/null -s "https://www.google.com"
```

### Detailed curl with all metrics:
```bash
curl -w "DNS: %{time_namelookup}s\nConnect: %{time_connect}s\nApp Connect: %{time_appconnect}s\nPre-Transfer: %{time_pretransfer}s\nStart Transfer: %{time_starttransfer}s\nTotal: %{time_total}s\n" \
     -o /dev/null -s -L "https://www.google.com"
```

### Continuous monitoring:
```bash
while true; do
  echo "$(date '+%Y-%m-%d %H:%M:%S') - $(curl -w 'Total:%{time_total}s' -o /dev/null -s https://www.google.com)"
  sleep 60
done
```

### MTR (My Traceroute) for path analysis:
```bash
mtr -r -c 50 www.google.com
```

---

## Glossary

- **DNS Lookup:** Time to resolve domain name to IP address
- **TCP Connect:** Time to establish TCP three-way handshake
- **SSL/TLS Handshake:** Time to negotiate secure connection parameters
- **TTFB (Time To First Byte):** Time from request start to first response byte
- **Total Time:** Complete request/response cycle duration
- **VC-GW:** Virtual Cloud Gateway (Check Point infrastructure)
- **EDGE:** Branch office router/gateway device
- **Last-mile:** ISP connection from branch to internet backbone

---

## Document Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-06-14 | Initial diagnostic report | Network Operations |

---

**Report Classification:** Internal  
**Distribution:** Network Engineering, Branch Operations, Management  
**Contact:** netops@company.com
