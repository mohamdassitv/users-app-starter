# Container Auto-Start Fix - Complete

## Issue Identified

The WAF troubleshooting exam containers were not starting properly because:

1. **Upstream container crash**: The `upstream` container (Node.js backend) was trying to run `cd /app && node server.js` in its startup command, but the `/app` directory didn't exist yet
2. **Setup timing issue**: The SessionManager creates the `/app` directory and sets up the Node.js application *after* the container starts, causing a race condition
3. **Result**: The upstream container would exit immediately with error code 2, preventing the WAF from working correctly

## Root Cause

**File**: `lab/src/session-manager.js`

**Line 310** (original):
```javascript
{
  name: `${prefix}-upstream`,
  image: 'node:18-alpine',
  hostname: 'upstream',
  cmd: 'sh -c "apk add --no-cache bash && cd /app && node server.js"',  // ❌ Crashes because /app doesn't exist yet
  caps: [],
  needsAppSetup: true
}
```

## Fix Applied

### Change 1: Update Container Startup Command
Changed the upstream container to use `tail -f /dev/null` instead of immediately trying to run the Node.js server:

**Line 310** (fixed):
```javascript
{
  name: `${prefix}-upstream`,
  image: 'node:18-alpine',
  hostname: 'upstream',
  cmd: 'sh -c "apk add --no-cache bash && tail -f /dev/null"',  // ✅ Keep container running
  caps: [],
  needsAppSetup: true
}
```

### Change 2: Start Server After Setup
Added code to start the Node.js server *after* the application setup is complete:

**Line 434** (added):
```javascript
// Start the Node.js server in background
await execAsync(`docker exec -d ${config.name} sh -c 'cd /app && node server.js'`);
console.log(`[SessionManager] ✓ Upstream app configured and started for ${config.name}`);
```

## Deployment Status

✅ **Fixed file uploaded to EC2**: `/home/ubuntu/app/lab/src/session-manager.js`
✅ **Copied into running container**: `/app/src/session-manager.js`
✅ **Container restarted**: `users-app` is running with the fix
✅ **Old exam containers cleaned up**: Ready for fresh test

## Verification Steps

### How to Test Container Auto-Start

1. **Open Admin Panel**:
   - URL: `http://34.244.246.180:8081/admin-login.html`
   - Login with admin credentials

2. **Start Exam for a Candidate**:
   - Click "Start Exam" button for any candidate
   - Wait 30-60 seconds for containers to initialize

3. **Verify Containers are Running**:
   ```bash
   ssh -i ExamForNewCandidates.pem ubuntu@34.244.246.180
   docker ps --filter "name=exam-"
   ```

   **Expected Output** (all containers with "Up" status):
   ```
   exam-XXXXXXXX-waf-nginx   Up X minutes   80/tcp
   exam-XXXXXXXX-upstream    Up X minutes   
   exam-XXXXXXXX-tokyo       Up X minutes
   exam-XXXXXXXX-osaka       Up X minutes
   exam-XXXXXXXX-kyoto       Up X minutes
   exam-XXXXXXXX-g1          Up X minutes
   exam-XXXXXXXX-g2          Up X minutes
   exam-XXXXXXXX-g3          Up X minutes
   exam-XXXXXXXX-g4          Up X minutes
   exam-XXXXXXXX-phoenix     Up X minutes
   exam-XXXXXXXX-leaf01      Up X minutes
   exam-XXXXXXXX-leaf02      Up X minutes
   exam-XXXXXXXX-router      Up X minutes
   ```

4. **Check Upstream Container Logs**:
   ```bash
   docker logs exam-XXXXXXXX-upstream
   ```

   **Expected Output**:
   ```
   Upstream server running on port 80
   ```

5. **Test WAF Terminal Access**:
   - Go to candidate task page: `http://34.244.246.180:8081/task/waf-troubleshooting.html`
   - Terminal should connect successfully and show prompt: `waf-nginx# `
   - ✅ **No more "Container is not running" error**

### Quick Check Commands

```bash
# SSH to EC2
ssh -i ExamForNewCandidates.pem ubuntu@34.244.246.180

# Check all exam containers (should see 13 containers)
docker ps --filter "name=exam-"

# Check upstream container specifically (should be "Up", not "Exited")
docker ps -a --filter "name=upstream"

# Verify upstream server is running
docker logs --tail 20 $(docker ps -q --filter "name=upstream")

# Test from inside waf-nginx container
docker exec $(docker ps -q --filter "name=waf-nginx") curl -H "Host: gt.maswebcs.com" http://exam-XXXXXXXX-upstream
```

## Intentional Bugs (Still Present)

The fix preserves all intentional bugs for candidates to troubleshoot:

### Task 7 - WAF Configuration Bug
**File**: NGINX config in `waf-nginx` container
**Bug**: Typo in proxy_set_header Host directive

```nginx
server {
    listen 80;
    server_name gt.maswebics.com msy.maswebics.com;
    
    location / {
        proxy_pass http://exam-XXXXXXXX-upstream:80;
        proxy_set_header Host gt.maswebcs.com;  # ❌ BUG: "maswebcs" instead of "maswebics"
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**Expected Behavior**:
- When candidate curls with correct Host header (`gt.maswebics.com`), they get `DEPLOYMENT_NOT_FOUND`
- This is because the WAF is forwarding with wrong Host header (`maswebcs.com` without 'i')
- Candidate must find and fix the typo in `/etc/nginx/conf.d/default.conf`

**Solution**:
```bash
# In waf-nginx terminal:
sed -i 's/maswebcs/maswebics/g' /etc/nginx/conf.d/default.conf
nginx -s reload
```

### Other Intentional Issues:
- **Task 2**: Osaka branch has network delay (100ms latency)
- **Task 3**: Gateway g4 has high disk usage (85% full)
- **Task 5**: Leaf containers missing default routes, router has IP forwarding disabled

## Container Architecture

Each candidate session gets isolated containers:

```
exam-<session-id>-tokyo       # Tokyo branch (normal)
exam-<session-id>-osaka       # Osaka branch (slow network - 100ms delay)
exam-<session-id>-kyoto       # Kyoto branch (normal)
exam-<session-id>-g1          # Gateway 1 (15-25% disk usage)
exam-<session-id>-g2          # Gateway 2 (15-25% disk usage)
exam-<session-id>-g3          # Gateway 3 (15-25% disk usage)
exam-<session-id>-g4          # Gateway 4 (85% disk usage - HIGH)
exam-<session-id>-phoenix     # Gateway Phoenix
exam-<session-id>-leaf01      # Leaf switch 01 (missing default route)
exam-<session-id>-leaf02      # Leaf switch 02 (missing default route)
exam-<session-id>-router      # Router (IP forwarding disabled)
exam-<session-id>-waf-nginx   # WAF with NGINX (typo bug in config)
exam-<session-id>-upstream    # Backend Node.js server (validates Host header)
```

All containers are on isolated network: `exam-<session-id>-net`

## Session Lifecycle

1. **Admin starts exam** → POST to `/api/candidate/:email/start`
2. **Cleanup old containers** → `sessionManager.cleanupAllSessions()`
3. **Create fresh session** → `sessionManager.initializeSession()`
4. **Spawn 13 containers** → Each with specific configuration
5. **Setup applications**:
   - WAF: Install AWS CLI, kubectl, create NGINX config with typo
   - Upstream: Install Node.js app, start Express server
   - Branches: Install network tools, apply delays (Osaka)
   - Gateways: Simulate disk usage patterns
   - Routing: Remove default routes, disable IP forwarding
6. **Register session** → Store in `activeSessions` map
7. **Return success** → Candidate can now access tasks

## Next Steps

### If Security Group is Still Blocking Port 8081:

The application is working internally but may not be accessible externally. Add inbound rule:

1. Go to AWS EC2 Console
2. Select instance `i-0fc5a91af937f1212`
3. Click "Security" tab → Click security group link
4. Click "Edit inbound rules"
5. Add rule:
   - **Type**: Custom TCP
   - **Port**: 8081
   - **Source**: Your IP or 0.0.0.0/0 (anywhere)
6. Save rules

### Test the Complete Flow:

1. Fix security group (if needed)
2. Open `http://34.244.246.180:8081` in browser
3. Login as admin
4. Start exam for a test candidate
5. Wait 60 seconds for containers to initialize
6. Verify all 13 containers are running (SSH to EC2)
7. Access task page as candidate
8. Terminal should connect successfully to `waf-nginx` container

## Summary

✅ **Fixed upstream container crash** - Container now stays running
✅ **Added server startup after setup** - Node.js app starts correctly
✅ **Preserved all intentional bugs** - Candidates still need to troubleshoot
✅ **Deployed to EC2** - Running with latest fix
✅ **Ready for testing** - Start a new exam session to verify

**Status**: All containers should now start automatically when admin starts a candidate's exam, with all intentional bugs intact for troubleshooting practice.
