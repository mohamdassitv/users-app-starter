# Testing Guide - Session Isolation System

## Prerequisites

Before testing, ensure:
- Docker is installed and running
- Docker Compose is available
- Port 8081 is available (or adjust docker-compose.yml)
- All dependencies installed: `cd lab && npm install`

## Local Testing Workflow

### 1. Start the Application

```powershell
cd c:\Users\mohamadasi\OneDrive` - Check` Point` Software` Technologies` Ltd\Desktop\users-app-starter\users-app-starter
docker-compose up -d --build
```

Wait for all containers to start:
```powershell
docker-compose logs -f app
```

Look for: `[Server] SessionManager initialized`

### 2. Access Admin Panel

1. Open browser: `http://localhost:8081/admin-login.html`
2. Enter admin password (check docker-compose.yml for ADMIN_PASSWORD)
3. You should see the Admin Dashboard with:
   - Session Panel (AUTH)
   - Config Panel
   - Candidates Panel
   - Final Work Panel
   - **Session Browser Panel** (new!)
   - Realtime Monitor

### 3. Create Test Candidate

In Admin Panel:
1. Click "Create Candidate"
2. Enter:
   - Name: `Test Candidate 1`
   - Email: `test1@example.com`
3. Click "Create"

### 4. Start Candidate Session

**Option A - From Admin Panel:**
1. Find candidate in Candidates table
2. Click "Start" button
3. Watch browser console for session initialization logs

**Option B - As Candidate:**
1. Open new incognito window: `http://localhost:8081/login.html?email=test1@example.com`
2. Click "Access Tasks"
3. System should create isolated session automatically

### 5. Verify Container Isolation

```powershell
# Check Docker containers
docker ps --filter "name=exam-"

# You should see 8 new containers with pattern: exam-{slug}-{role}
# Example:
# exam-abc123xy-tokyo
# exam-abc123xy-osaka
# exam-abc123xy-kyoto
# exam-abc123xy-g1
# exam-abc123xy-g2
# exam-abc123xy-g3
# exam-abc123xy-g4
# exam-abc123xy-phoenix

# Check network
docker network ls | Select-String "exam-"
```

**Expected Result:** 8 containers and 1 network with session-specific prefix

### 6. Test Terminal Access

1. In candidate browser, navigate to a task with terminal (e.g., Task 1)
2. Terminal should open and connect
3. Run commands:
   ```bash
   hostname
   # Should show: exam-{slug}-tokyo (or similar)
   
   ip addr
   # Should show isolated network
   
   ping exam-{slug}-osaka
   # Should reach other session containers
   ```

**Expected Result:** Terminal connects to session-specific container

### 7. Test Answer Persistence

1. Answer any question in the exam
2. Wait a few seconds for auto-save
3. Check file system:

```powershell
# Find the session directory
Get-ChildItem "c:\Users\mohamadasi\OneDrive - Check Point Software Technologies Ltd\Desktop\users-app-starter\users-app-starter\lab\state\sessions" -Recurse -Filter "*.json"
```

**Expected Result:** 
- `sessions/{slug}/metadata.json` exists
- `sessions/{slug}/answers/{taskId}.json` exists with answer data

### 8. Test Session Browser in Admin

1. Go back to Admin Panel
2. Scroll to "Session Browser" panel
3. Click "Refresh"

**Expected Result:**
- Session appears in table
- Status shows "ACTIVE" badge (green)
- Shows "8 running" containers
- View button available

### 9. View Session Details

1. Click "View" button for the session
2. Modal opens showing:
   - **Session Info:** Email, status, timestamps
   - **Containers:** List of 8 container names
   - **Answers:** All saved answers formatted
   - **Terminal Logs:** Command history (if terminals were used)

**Expected Result:** All session data visible

### 10. Test Submission & Snapshot

1. In candidate browser, complete exam
2. Click "Submit Final Work"
3. In PowerShell, watch logs:

```powershell
docker-compose logs -f app | Select-String "snapshot|cleanup"
```

**Expected Result:**
- Logs show: `[Submit] Creating session snapshot for test1@example.com`
- Logs show: `[Submit] Snapshot complete`
- Logs show: `[Submit] Session cleanup complete`

### 11. Verify Cleanup & Preservation

```powershell
# Check containers removed
docker ps --filter "name=exam-" 
# Should be empty

# Check state preserved
Get-ChildItem "c:\Users\mohamadasi\OneDrive - Check Point Software Technologies Ltd\Desktop\users-app-starter\users-app-starter\lab\state\sessions\{slug}\docker-snapshots"
```

**Expected Result:**
- All containers stopped and removed
- State directory still exists with:
  - `metadata.json` (status: "completed")
  - `answers/` folder with all answers
  - `docker-snapshots/` folder with .tar and .log files

### 12. Test Multiple Sequential Candidates

Repeat steps 3-11 with a second candidate:
- Name: `Test Candidate 2`
- Email: `test2@example.com`

**Verify:**
1. Second candidate gets different container names (different slug)
2. Both session directories exist independently
3. Session Browser shows both sessions
4. Each session's data is isolated

### 13. Test Session Review After Completion

1. In Admin Panel, Session Browser
2. Click "View" on completed session
3. Verify all data still accessible:
   - Answers preserved
   - Terminal logs preserved
   - Container list shows (even though removed)

## Troubleshooting

### Problem: SessionManager not initialized

**Symptoms:** Logs don't show `[Server] SessionManager initialized`

**Fix:**
```powershell
docker-compose logs app | Select-String "error|fail"
# Check for module loading errors
```

### Problem: Containers not spawning

**Symptoms:** `docker ps` shows no exam-* containers after clicking Start

**Check:**
1. Docker socket mounted in docker-compose.yml:
   ```yaml
   volumes:
     - /var/run/docker.sock:/var/run/docker.sock
   ```
2. App container has Docker CLI:
   ```powershell
   docker-compose exec app docker --version
   ```
3. Check app logs:
   ```powershell
   docker-compose logs app | Select-String "initializeSession"
   ```

### Problem: Terminal won't connect

**Symptoms:** Terminal shows "Connecting..." forever

**Check:**
1. Container exists:
   ```powershell
   docker ps --filter "name=exam-"
   ```
2. WebSocket connection in browser console (F12)
3. Cookie `candidateSlug` is set (check browser DevTools → Application → Cookies)

### Problem: Answers not saving to session directory

**Check:**
1. Session initialized:
   ```powershell
   Get-ChildItem "lab\state\sessions"
   ```
2. Check app logs:
   ```powershell
   docker-compose logs app | Select-String "Answer"
   ```

### Problem: Snapshot fails

**Check disk space:**
```powershell
Get-PSDrive C
```

**Check permissions:**
```powershell
Test-Path "lab\state\sessions" -PathType Container
```

## Success Criteria Checklist

- [ ] SessionManager initializes on app start
- [ ] 8 containers spawn when candidate clicks Start
- [ ] Unique network created per session
- [ ] Terminal connects to session-specific container
- [ ] `hostname` in terminal shows session container name
- [ ] Answers save to both state.json and session directory
- [ ] Session Browser panel shows active session
- [ ] View button opens modal with session details
- [ ] Submit triggers snapshot creation
- [ ] Snapshot creates .tar files in docker-snapshots/
- [ ] Cleanup removes containers but keeps state directory
- [ ] Completed session still viewable in Session Browser
- [ ] Second candidate gets completely separate containers
- [ ] Both sessions' data remains isolated and accessible

## Performance Notes

**Resource Usage Per Session:**
- 8 Docker containers (~100MB RAM each = ~800MB total)
- 1 Docker network
- Disk space: ~50-200MB (depending on container activity)

**Recommendations:**
- Test with 1-2 candidates locally
- On EC2, consider instance size based on concurrent candidates
- Monitor disk usage in `/state/sessions/` for growth

## Next Steps After Local Testing

Once all tests pass locally:

1. **Commit changes:**
   ```powershell
   git add .
   git commit -m "Add per-candidate session isolation with Docker containers"
   git push origin main
   ```

2. **Deploy to EC2** (see IMPLEMENTATION_SUMMARY.md)

3. **Test on EC2** with real network conditions

4. **Monitor production** for container leaks or resource issues
