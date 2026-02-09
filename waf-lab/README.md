# WAF Reverse-Proxy Troubleshooting Lab
## Task 7 Lab Environment

This directory contains the Docker-based lab environment for Task 7, which simulates a WAF (Web Application Firewall) reverse-proxy troubleshooting scenario.

## Quick Start

### 1. Start the Lab
```bash
docker-compose up -d
```

### 2. Verify the Problem
```bash
curl http://localhost:8090
```

You should see a JSON error response:
```json
{
  "error": "DEPLOYMENT_NOT_FOUND",
  "message": "No deployment found for host: bayer.quanthealh.ai",
  ...
}
```

### 3. Access the WAF Container
```bash
docker exec -it waf-nginx /bin/sh
```

### 4. Inspect Configuration
```bash
cat /etc/nginx/conf.d/default.conf
```

Look for the line with `proxy_set_header Host` - there's a typo here!

### 5. Fix and Verify
After making your fix and reloading NGINX, test again:
```bash
curl http://localhost:8090
```

You should now see HTML with "Welcome to Bayer QuantHealth".

Or open in browser: http://localhost:8090

## Architecture

```
User Request (port 8090)
    ↓
WAF Container (waf-nginx)
│   - NGINX reverse proxy
│   - Contains typo in config
    ↓
Upstream Container (upstream-app)
│   - Node.js/Express application
│   - Validates Host header
│   - Returns error if Host doesn't match
    ↓
Response
```

## Components

### waf-nginx Container
- **Image:** nginx:alpine
- **Port:** 8090 (host) → 80 (container)
- **Config:** `./nginx/default.conf` mounted to `/etc/nginx/conf.d/default.conf`
- **Purpose:** Acts as reverse proxy with intentional misconfiguration

### upstream-app Container
- **Image:** Custom Node.js (built from ./upstream)
- **Port:** 3000 (internal only)
- **Environment:**
  - `EXPECTED_HOST=bayer.quanthealth.ai`
- **Purpose:** Multi-tenant app that validates Host header

## Files

```
waf-lab/
├── docker-compose.yml       # Orchestrates both containers
├── nginx/
│   └── default.conf        # NGINX config with typo (proxy_set_header Host)
└── upstream/
    ├── Dockerfile          # Node.js container definition
    ├── package.json        # Dependencies
    └── server.js           # Express app with Host validation
```

## The Bug

**Location:** `nginx/default.conf`  
**Line:** `proxy_set_header Host bayer.quanthealh.ai;`

**Problem:** Missing 't' in "quanthealth"  
**Correct:** `proxy_set_header Host bayer.quanthealth.ai;`

The upstream application expects exactly `bayer.quanthealth.ai` in the Host header. Any mismatch results in `DEPLOYMENT_NOT_FOUND` error.

## Cleanup

```bash
docker-compose down
```

## Troubleshooting

### Container won't start
```bash
docker-compose logs waf-nginx
docker-compose logs upstream-app
```

### Can't edit config in container
Use `sed` instead of `vi`:
```bash
sed -i 's/quanthealh/quanthealth/g' /etc/nginx/conf.d/default.conf
```

### Changes not taking effect
Make sure to reload NGINX:
```bash
nginx -s reload
```

Or restart the container:
```bash
docker restart waf-nginx
```

### Reset to initial state
```bash
docker-compose down
docker-compose up -d
```

The typo is in the host file, so restarting restores the broken state.

## Testing

**Before fix:**
```bash
$ curl http://localhost:8090
{"error":"DEPLOYMENT_NOT_FOUND",...}
```

**After fix:**
```bash
$ curl http://localhost:8090
<!DOCTYPE html>
<html>
...
<h1>Welcome to Bayer QuantHealth</h1>
...
```

## Learning Objectives

- Container debugging
- NGINX reverse proxy configuration
- HTTP Host header routing
- Systematic troubleshooting
- Configuration management best practices

---

**Difficulty:** Intermediate  
**Time:** 20-30 minutes  
**Prerequisites:** Basic Docker, Linux commands, HTTP concepts
