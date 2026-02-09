# Task 7 Implementation Summary
**WAF Reverse-Proxy Troubleshooting Scenario**

## ✅ What Was Created

### 1. Student-Facing Components

#### Task Page (`/lab/src/public/task/waf-troubleshooting.html`)
- **Modern, responsive UI** matching the existing exam aesthetic
- **Left Panel:** Complete scenario description with:
  - Customer context (Bayer QuantHealth)
  - Architecture diagram (User → WAF → Upstream)
  - Clear objectives (6 steps)
  - Getting started commands
  - Hints without revealing the solution
- **Right Panel:** Answer submission form with 6 fields:
  1. Root cause identification
  2. Incorrect configuration value
  3. Correct configuration value
  4. Commands used to fix
  5. Verification steps
  6. Prevention recommendations
- **Auto-save functionality** for draft answers
- **Session integration** with persistent storage

#### Tasks List Entry (`tasks.html`)
- Added Task 7 row with "Infrastructure" badge
- Links to `/task/waf-troubleshooting.html`

### 2. Lab Environment (`/waf-lab/`)

#### Docker Compose Setup (`docker-compose.yml`)
Two-container architecture:
- **waf-nginx:** NGINX Alpine container (port 8090)
- **upstream-app:** Custom Node.js application (port 3000, internal)
- Connected via bridge network

#### NGINX Configuration (`nginx/default.conf`)
- **Intentional bug:** `proxy_set_header Host bayer.quanthealh.ai;`
  - Missing 't' in "quanthealth"
  - Should be: `bayer.quanthealth.ai`
- Properly configured reverse proxy otherwise
- Health check endpoint at `/health`

#### Upstream Application (`upstream/`)
**Node.js/Express app** (`server.js`) that:
- Validates the Host header on all requests
- Returns **success page** (HTTP 200) when Host = `bayer.quanthealth.ai`
- Returns **DEPLOYMENT_NOT_FOUND error** (HTTP 404) for any other Host
- Logs all requests with Host header values
- Simulates real multi-tenant behavior

**Files:**
- `Dockerfile` - Node 18 Alpine image
- `package.json` - Express dependency
- `server.js` - Application logic

### 3. Documentation

#### Main README Update (`README.md`)
- Added Task 7 to the task list
- Complete scenario description
- Start commands
- What students must produce
- Reference to instructor notes

#### Lab README (`waf-lab/README.md`)
- Quick start guide
- Architecture diagram
- Component descriptions
- Bug explanation (for instructors)
- Troubleshooting tips
- Testing procedures

#### Instructor Notes (`TASK7_INSTRUCTOR_NOTES.md`)
**Comprehensive 200+ line guide** including:
- Learning objectives
- Complete solution walkthrough
- Grading rubric (100 points breakdown)
- Expected answers and prevention recommendations
- Troubleshooting guide for common student issues
- Reset procedures
- Variations and extensions for advanced students
- Time expectations (10-60 minutes)
- Success indicators
- Testing checklist

---

## 🎯 How It Works

### The Broken State
1. Student starts Docker lab: `docker-compose up -d`
2. Tries to access site: `curl http://localhost:8090`
3. Receives error:
   ```json
   {
     "error": "DEPLOYMENT_NOT_FOUND",
     "message": "No deployment found for host: bayer.quanthealh.ai",
     "expected": "bayer.quanthealth.ai",
     "received": "bayer.quanthealh.ai"
   }
   ```

### The Investigation
1. Access container: `docker exec -it waf-nginx /bin/sh`
2. Inspect config: `cat /etc/nginx/conf.d/default.conf`
3. Find typo in line: `proxy_set_header Host bayer.quanthealh.ai;`

### The Fix
1. Edit config:
   ```bash
   sed -i 's/quanthealh/quanthealth/g' /etc/nginx/conf.d/default.conf
   ```
2. Reload NGINX: `nginx -s reload`

### The Verification
1. Test again: `curl http://localhost:8090`
2. Receives success:
   ```html
   <!DOCTYPE html>
   <html>
   ...
   <h1>Welcome to Bayer QuantHealth</h1>
   ...
   ```

---

## 📚 Educational Value

### Skills Practiced
✅ **Container debugging** - Exec into running containers  
✅ **NGINX configuration** - Understanding reverse proxy directives  
✅ **HTTP headers** - Role of Host header in routing  
✅ **Systematic troubleshooting** - Methodical investigation  
✅ **Configuration management** - Recognizing typos and validation needs  

### Real-World Relevance
This mirrors actual NOC/DevOps scenarios:
- Multi-tenant SaaS platforms with host-based routing
- WAF/reverse proxy misconfigurations
- Post-deployment issues requiring live debugging
- Configuration typos causing production outages

### Difficulty Level
- **Estimated time:** 20-30 minutes (average student)
- **Complexity:** Intermediate
- **Prerequisites:** Basic Docker, Linux, HTTP concepts

---

## 🎓 Grading Components (100 Points)

| Component | Points | What's Assessed |
|-----------|--------|-----------------|
| Root Cause | 25 | Identifies Host header typo in NGINX config |
| Incorrect Value | 15 | States `bayer.quanthealh.ai` |
| Correct Value | 15 | States `bayer.quanthealth.ai` |
| Fix Commands | 20 | Valid edit + reload commands |
| Verification | 15 | Testing methodology (curl/browser) |
| Prevention | 10 | 3+ measures (IaC, testing, review, etc.) |

---

## 🚀 Quick Start for Instructors

### Test the Lab
```bash
cd waf-lab
docker-compose up -d
curl http://localhost:8090  # Should show error
docker exec -it waf-nginx sed -i 's/quanthealh/quanthealth/g' /etc/nginx/conf.d/default.conf
docker exec -it waf-nginx nginx -s reload
curl http://localhost:8090  # Should show success page
docker-compose down
```

### Reset for Students
```bash
cd waf-lab
docker-compose down
docker-compose up -d
```
The typo is in the host file (`nginx/default.conf`), so restarting always restores the broken state.

---

## 🔄 Integration with Existing Exam

### Fits Seamlessly
- **UI consistency:** Matches existing task pages (dark theme, gradient buttons)
- **Session management:** Uses same candidate/timer system
- **Answer persistence:** Saves to `/api/sessions/{id}/answers`
- **Auto-save:** Draft answers stored in localStorage
- **Navigation:** Back button to tasks, header with timer

### No Breaking Changes
- Only additions, no modifications to existing tasks
- Independent Docker environment
- Separate lab directory (`waf-lab/`)

---

## 📊 Files Created/Modified

### Created (9 files)
1. `/lab/src/public/task/waf-troubleshooting.html` (Student task page)
2. `/waf-lab/docker-compose.yml` (Lab orchestration)
3. `/waf-lab/nginx/default.conf` (NGINX config with typo)
4. `/waf-lab/upstream/Dockerfile` (Container definition)
5. `/waf-lab/upstream/package.json` (Node dependencies)
6. `/waf-lab/upstream/server.js` (Upstream application)
7. `/waf-lab/README.md` (Lab quick start)
8. `/TASK7_INSTRUCTOR_NOTES.md` (Complete solution guide)

### Modified (2 files)
1. `/lab/src/public/tasks.html` (Added Task 7 row)
2. `/README.md` (Added Task 7 description)

---

## 🎯 Success Criteria

Students successfully complete Task 7 when they:
1. ✅ Identify the typo: `bayer.quanthealh.ai` → `bayer.quanthealth.ai`
2. ✅ Provide valid fix commands (edit + reload)
3. ✅ Verify the site returns HTTP 200 with welcome page
4. ✅ Suggest 3+ prevention measures
5. ✅ Submit answers via the form

---

## 💡 Why This Design Works

### Realistic Scenario
- Based on actual production WAF troubleshooting
- Multi-tenant host-based routing is common in SaaS
- Typos in configs are realistic operator errors

### Clear Learning Path
1. Observe the symptom (error message)
2. Access the system (container exec)
3. Inspect configuration (cat/grep)
4. Identify root cause (typo)
5. Apply fix (edit + reload)
6. Verify resolution (test)

### Self-Contained
- No external dependencies
- Runs entirely in Docker
- Easy to reset and retest
- Portable across environments

### Measurable Outcomes
- Concrete correct answers exist
- Multiple verification methods
- Clear grading rubric
- Observable success (site works)

---

## 🔮 Future Enhancements (Optional)

### Easy Additions
- Add Kubernetes version (Ingress + ConfigMap)
- Multiple tenant configurations (2-3 deployments)
- SSL/TLS with certificate issues
- NGINX rate limiting rules

### Advanced Variations
- Logging analysis task (grep NGINX logs)
- Prometheus metrics integration
- Distributed tracing with OpenTelemetry
- Automated remediation scripting

---

## 📞 Support

**For Students:**
- See task page for hints
- Check `waf-lab/README.md` for troubleshooting
- Use auto-save to preserve progress

**For Instructors:**
- See `TASK7_INSTRUCTOR_NOTES.md` for complete solution
- Check "Troubleshooting for Instructors" section
- Reset lab: `cd waf-lab && docker-compose down && docker-compose up -d`

---

**Task 7 is ready for deployment! 🎉**

All components are integrated, tested, and documented. Students can begin immediately after running `docker-compose up -d` in the `waf-lab/` directory.
