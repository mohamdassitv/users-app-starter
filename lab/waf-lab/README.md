# Task 4 — WAF Reverse-Proxy Troubleshooting Lab

## Overview
Task 4 provides a realistic NOC troubleshooting scenario where candidates investigate and fix a WAF (Web Application Firewall) reverse-proxy configuration issue causing HTTP 502 errors.

## Layout
- **Split 50/50 Design**:
  - **Left Panel**: Documentation (Scenario, Jira Ticket, 9-Step Playbook)
  - **Right Panel**: Live xterm.js terminal connected to `waf-nginx` container

## Scenario
Customer **Bayer QuantHealth** reports their production website (`bayer.quanthealth.ai`) is completely down with HTTP 502 errors. TLS, DNS, and CDN are operational—the issue is in the WAF configuration.

### The Bug
NGINX config has intentional typo in `proxy_set_header Host` directive:
```nginx
proxy_set_header Host bayer.quanthealh.ai;  # Missing 't' in "health"
```

This causes the upstream service to reject requests with `DEPLOYMENT_NOT_FOUND` (404) because it validates the Host header.

## Docker Infrastructure

### Architecture
```
CloudFront CDN → WAF NGINX Proxy → Upstream Node.js App
                  (port 8090)         (internal)
```

### Containers
1. **waf-nginx** (nginx:alpine)
   - Reverse proxy with intentional typo
   - Port: 8090 → 80
   - Config: `/etc/nginx/conf.d/default.conf`
   
2. **upstream** (Node.js 18 Alpine)
   - Express.js server
   - Validates Host header must be `bayer.quanthealth.ai`
   - Returns HTML welcome page on success
   - Returns `DEPLOYMENT_NOT_FOUND` on Host mismatch

### Network
- Custom bridge network: `waf-lab_waf-network`
- Containers communicate via service names

## Testing the Lab

### Before Fix (Bug Present)
```bash
docker exec waf-nginx curl -i http://localhost
# Returns: DEPLOYMENT_NOT_FOUND
```

### After Fix (Typo Corrected)
```bash
# Inside waf-nginx container:
sed -i 's/quanthealh/quanthealth/g' /etc/nginx/conf.d/default.conf
nginx -s reload
curl -i http://localhost
# Returns: HTTP/1.1 200 OK
# Welcome to Bayer QuantHealth Platform
```

## Playbook Steps
1. List running containers
2. Access WAF container (`docker exec -it waf-nginx /bin/sh`)
3. Validate NGINX syntax (`nginx -t`)
4. Inspect config (`cat /etc/nginx/conf.d/default.conf`)
5. Compare Host header with expected domain
6. Test upstream directly with correct header
7. Fix typo (vi or sed)
8. Reload NGINX (`nginx -s reload`)
9. Validate fix (`curl -i http://localhost`)

## Terminal Integration
- **WebSocket Endpoint**: `/api/terminal-ws/waf-nginx`
- **Auto-clear**: Terminal sends `clear\r` after 500ms connection
- **Download**: Save full terminal buffer to `.txt` file
- **Font**: Cascadia Code, 14px, dark theme

## Deployment

### Local Setup
```bash
cd lab/waf-lab
docker-compose up -d --build
docker ps | grep -E 'waf-nginx|upstream'
```

### EC2 Deployment
```bash
# Upload files
scp -r lab/waf-lab ubuntu@34.244.246.180:/tmp/
ssh ubuntu@34.244.246.180

# Deploy
cd /tmp/waf-lab
docker-compose up -d --build

# Copy Task 4 HTML
docker cp /tmp/waf-troubleshooting.html users-app:/app/src/public/task/
docker restart users-app
```

### Verify
```bash
# Check containers
docker ps | grep -E 'waf-nginx|upstream'

# Test bug
docker exec waf-nginx curl -s http://localhost
# Should return: DEPLOYMENT_NOT_FOUND

# Test correct behavior
docker exec waf-nginx curl -H "Host: bayer.quanthealth.ai" http://upstream:80
# Should return: Welcome to Bayer QuantHealth Platform
```

## Access
- **Task 4 URL**: http://34.244.246.180:8081/task/waf-troubleshooting.html
- **Terminal**: Connected to `waf-nginx` container via WebSocket
- **WAF Direct**: http://34.244.246.180:8090 (returns error before fix)

## Success Criteria
Candidate successfully:
1. Identifies the typo in NGINX Host header configuration
2. Edits the config to change `quanthealh` → `quanthealth`
3. Reloads NGINX without downtime
4. Validates website now returns HTTP 200 and welcome page

## Files
```
lab/
├── waf-lab/
│   ├── docker-compose.yml    # Orchestrates waf-nginx + upstream
│   ├── nginx.conf             # NGINX config with intentional typo
│   └── upstream/
│       ├── Dockerfile         # Node.js 18 Alpine image
│       ├── package.json       # Express.js dependency
│       └── server.js          # Host-validating web server
└── src/public/task/
    └── waf-troubleshooting.html  # Split-layout Task 4 UI
```

## Jira Ticket Details
- **Ticket**: SR-847291
- **Reporter**: Sarah Chen (Bayer QuantHealth DevOps)
- **Domain**: bayer.quanthealth.ai
- **Account ID**: 8ab93415-5bb1-4fdf-b1dc-2d1174626109
- **Parent Account**: 3c7f2e91-8d4a-4b2e-9f5c-1a6b3d8e4f7a
- **Region**: EU (eu-west-1)
- **Priority**: P1 - CRITICAL
- **Error**: HTTP/2 502, CloudFront error, DEPLOYMENT_NOT_FOUND

## Maintenance

### Update NGINX Config
```bash
docker exec -it waf-nginx vi /etc/nginx/conf.d/default.conf
docker exec waf-nginx nginx -s reload
```

### View Upstream Logs
```bash
docker logs -f upstream
```

### Restart Lab
```bash
cd /tmp/waf-lab
docker-compose restart
```

### Clean Up
```bash
cd /tmp/waf-lab
docker-compose down
docker network prune -f
```
