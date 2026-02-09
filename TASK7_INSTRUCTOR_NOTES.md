# Task 7: WAF Reverse-Proxy Troubleshooting
## Instructor Notes & Solution Guide

---

## 📋 Overview

Task 7 simulates a real-world WAF (Web Application Firewall) reverse-proxy troubleshooting scenario commonly encountered in NOC/DevOps environments. Students must diagnose and fix a configuration error that prevents access to a customer's web application.

### Learning Objectives
- Practice container debugging techniques
- Understand reverse proxy configuration
- Recognize the importance of Host header routing
- Develop systematic troubleshooting methodology
- Apply configuration management best practices

---

## 🎯 Scenario Summary

**Customer:** Bayer QuantHealth  
**Issue:** Website completely inaccessible through WAF  
**Environment:** Docker-based with NGINX reverse proxy and Node.js upstream  
**Root Cause:** Typo in NGINX configuration (`proxy_set_header Host`)

### Architecture
```
User Request (port 8090)
    ↓
WAF Container (NGINX)
    ↓ (proxy_pass with Host header)
Upstream Container (Node.js/Express)
    ↓ (validates Host header)
Response or Error
```

---

## 🔍 Root Cause (Intentional Bug)

**File:** `/etc/nginx/conf.d/default.conf` (inside waf-nginx container)  
**Line:** `proxy_set_header Host bayer.quanthealh.ai;`

**The Problem:**
- **Incorrect:** `bayer.quanthealh.ai` (missing 't' in "quanthealth")
- **Correct:** `bayer.quanthealth.ai`

The upstream application validates the Host header and only serves content when it receives the exact expected value (`bayer.quanthealth.ai`). Any mismatch results in a `DEPLOYMENT_NOT_FOUND` error (HTTP 404).

---

## ✅ Solution Steps

### 1. Start the Lab Environment
```bash
cd waf-lab
docker-compose up -d
```

### 2. Verify the Problem
```bash
# Test from host machine
curl http://localhost:8090

# Expected output: JSON error with DEPLOYMENT_NOT_FOUND
```

### 3. Access the WAF Container
```bash
docker exec -it waf-nginx /bin/sh
```

### 4. Inspect NGINX Configuration
```bash
cat /etc/nginx/conf.d/default.conf
```

**What to look for:**
- Line with `proxy_set_header Host`
- Notice the typo: `bayer.quanthealh.ai` (should be `quanthealth`)

### 5. Fix the Configuration

**Option A: Using vi/vim**
```bash
vi /etc/nginx/conf.d/default.conf
# Navigate to the line with proxy_set_header Host
# Change: bayer.quanthealh.ai
# To:     bayer.quanthealth.ai
# Save and exit (:wq)
```

**Option B: Using sed**
```bash
sed -i 's/quanthealh/quanthealth/g' /etc/nginx/conf.d/default.conf
```

### 6. Reload NGINX
```bash
nginx -t              # Test configuration syntax
nginx -s reload       # Reload configuration
```

**Alternative: Restart the container (from host)**
```bash
docker restart waf-nginx
```

### 7. Verify the Fix
```bash
# Exit container
exit

# Test from host
curl http://localhost:8090

# Expected: HTML page with "Welcome to Bayer QuantHealth"
# Status: HTTP 200 OK
```

**Or test in browser:**
- Navigate to `http://localhost:8090`
- Should see the purple gradient welcome page

---

## 📊 Grading Rubric (100 points)

| Component | Points | Criteria |
|-----------|--------|----------|
| **Root Cause Identification** | 25 | Clearly identifies the typo in the Host header configuration |
| **Incorrect Value** | 15 | Correctly states `bayer.quanthealh.ai` (or similar description) |
| **Correct Value** | 15 | Correctly states `bayer.quanthealth.ai` |
| **Fix Commands** | 20 | Provides valid commands (vi/sed + reload/restart) |
| **Verification Steps** | 15 | Describes testing methodology (curl/browser test) |
| **Prevention Recommendations** | 10 | Suggests 3+ valid preventive measures |

### Partial Credit Guidelines

**Root Cause (25 pts):**
- 25: Precise identification with line/file reference
- 20: Identifies Host header issue but vague on exact location
- 15: Mentions configuration problem generically
- 10: Recognizes something is wrong but unclear what
- 0: Incorrect or no identification

**Commands (20 pts):**
- 20: Complete workflow (edit + verify + reload)
- 15: Edit command only (missing reload)
- 10: Correct concept but syntax errors
- 5: Incorrect approach (e.g., trying to edit from host)
- 0: No commands or completely wrong

**Verification (15 pts):**
- 15: Multiple verification methods (curl + browser, or logs)
- 12: Single clear verification method
- 8: Describes verification but lacks specifics
- 4: Vague testing description
- 0: No verification described

**Prevention (10 pts):**
- 10: 5+ relevant, specific recommendations
- 8: 3-4 solid recommendations
- 6: 2-3 basic recommendations
- 3: 1-2 generic suggestions
- 0: None or irrelevant

---

## 🎓 Expected Prevention Recommendations

Students should suggest measures such as:

1. **Configuration Validation**
   - Pre-deployment syntax checks (`nginx -t`)
   - Automated config linting in CI/CD pipeline

2. **Infrastructure as Code**
   - Store configs in version control (Git)
   - Use templating (Helm, Ansible, Terraform)
   - Reduce manual editing

3. **Testing & Monitoring**
   - Automated smoke tests post-deployment
   - Health checks with correct Host headers
   - Synthetic monitoring for customer domains

4. **Peer Review**
   - Require code review for config changes
   - Four-eyes principle for production updates

5. **Documentation**
   - Maintain runbook for common config patterns
   - Document expected Host header values per customer

6. **Deployment Process**
   - Blue-green or canary deployments
   - Rollback capability
   - Staging environment testing first

---

## 🛠️ Troubleshooting for Instructors

### Students Report: "I can't access the container"

**Check:**
```bash
docker ps | grep waf-nginx
```

**If not running:**
```bash
cd waf-lab
docker-compose up -d
```

### Students Report: "The fix didn't work"

**Common mistakes:**
1. Edited the file but didn't reload NGINX
   ```bash
   docker exec -it waf-nginx nginx -s reload
   ```

2. Made a syntax error in the config
   ```bash
   docker exec -it waf-nginx nginx -t
   # Look for syntax errors
   ```

3. Edited the wrong file or wrong container
   ```bash
   # Verify they're in the WAF container, not upstream
   docker exec -it waf-nginx cat /etc/nginx/conf.d/default.conf | grep Host
   ```

### Students Report: "I get permission denied when editing"

**Solution:**
```bash
# Alpine NGINX doesn't have vi by default
# They need to use vi (which is busybox vi) or sed
docker exec -it waf-nginx sed -i 's/quanthealh/quanthealth/g' /etc/nginx/conf.d/default.conf
```

### Reset Lab to Initial State

```bash
cd waf-lab
docker-compose down
docker-compose up -d
```

The typo is baked into the nginx/default.conf file on the host, so restarting containers restores the broken config.

---

## 📦 Lab File Structure

```
waf-lab/
├── docker-compose.yml          # Orchestrates WAF + upstream
├── nginx/
│   └── default.conf           # NGINX config WITH TYPO
└── upstream/
    ├── Dockerfile             # Node.js app container
    ├── package.json           # Dependencies
    └── server.js              # Multi-tenant app with Host validation
```

---

## 🔄 Variations & Extensions

### For Advanced Students:
1. **Add SSL/TLS:** Configure HTTPS with self-signed certificates
2. **Multiple Deployments:** Add 2-3 more tenants with different Host headers
3. **Rate Limiting:** Add NGINX rate limiting rules
4. **Logging Analysis:** Parse NGINX access logs to find the error
5. **Kubernetes Migration:** Convert to K8s Ingress + Service

### Alternative Scenarios:
- Wrong port in `proxy_pass` directive
- Missing `proxy_set_header` entirely
- Typo in upstream server name
- Firewall/security group blocking traffic
- Certificate validation failure (if using HTTPS)

---

## 📚 Related Concepts

This task reinforces:
- **Reverse Proxy Architecture:** How WAF/load balancers work
- **HTTP Headers:** Role of Host header in routing
- **Container Networking:** Inter-container communication
- **Configuration Management:** Importance of IaC and testing
- **Debugging Methodology:** Systematic troubleshooting approach

---

## ⏱️ Time Expectations

- **Fast Students:** 10-15 minutes
- **Average Students:** 20-30 minutes  
- **Struggling Students:** 40-60 minutes

**Hints to provide if stuck after 20 minutes:**
1. "Check the NGINX configuration file for the Host header directive"
2. "Compare what the WAF is sending vs. what the upstream expects"
3. "Look for spelling mistakes in domain names"

---

## 🎯 Success Indicators

**Student has completed the task successfully when:**
1. ✅ Can curl `http://localhost:8090` and get HTTP 200
2. ✅ Browser shows the purple "Welcome to Bayer QuantHealth" page
3. ✅ Submitted form includes correct before/after values
4. ✅ Commands are valid and demonstrate understanding
5. ✅ Prevention recommendations show systems thinking

---

## 🧪 Testing the Lab (Instructor Checklist)

Before releasing to students:

```bash
# Start environment
cd waf-lab
docker-compose up -d

# Verify broken state
curl http://localhost:8090
# Should return JSON error with DEPLOYMENT_NOT_FOUND

# Access container
docker exec -it waf-nginx /bin/sh

# Check config has typo
cat /etc/nginx/conf.d/default.conf | grep "proxy_set_header Host"
# Should show: bayer.quanthealh.ai

# Apply fix
sed -i 's/quanthealh/quanthealth/g' /etc/nginx/conf.d/default.conf
nginx -s reload
exit

# Verify fixed state
curl http://localhost:8090
# Should return HTML with "Welcome to Bayer QuantHealth"

# Cleanup
docker-compose down
```

---

## 📖 Additional Resources for Students

- NGINX Proxy Configuration: https://nginx.org/en/docs/http/ngx_http_proxy_module.html
- Docker Exec Documentation: https://docs.docker.com/engine/reference/commandline/exec/
- HTTP Host Header: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Host
- Debugging Containers: https://kubernetes.io/docs/tasks/debug/debug-application/

---

**Last Updated:** December 2025  
**Difficulty:** Intermediate  
**Category:** Infrastructure / Troubleshooting  
**Prerequisites:** Basic Linux commands, Docker fundamentals, HTTP concepts
