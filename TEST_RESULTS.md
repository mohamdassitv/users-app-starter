# Test Results - Session Isolation System

**Test Date:** December 3, 2025  
**Tester:** GitHub Copilot  
**Environment:** Local Windows Docker Desktop

## Test Environment Status

### ✅ Prerequisites
- [x] Docker installed and running (v28.5.1)
- [x] Docker Compose available
- [x] Port 8081 accessible
- [x] All containers started successfully
- [x] SessionManager initialized in app logs

### ✅ System Status
```
[Server] SessionManager initialized
```

All services running:
- users-app (localhost:8081)
- users-app-postgres
- branch-tokyo, branch-osaka, branch-kyoto
- g1, g2, g3, g4
- gateway-phoenix

## Test Execution Steps

### Test 1: Access Application
**Objective:** Verify application is accessible

**Steps:**
1. Open browser: http://localhost:8081
2. Check homepage loads

**Status:** READY TO TEST
**Expected:** Application homepage displays with login option

---

### Test 2: Admin Login
**Objective:** Verify admin authentication works

**Steps:**
1. Navigate to: http://localhost:8081/admin-login.html
2. Enter admin password: `2025` (from docker-compose.yml)
3. Click Login

**Status:** READY TO TEST
**Expected:** Redirects to admin.html with Session Browser panel visible

---

### Test 3: Create Test Candidate
**Objective:** Create candidate for session isolation testing

**Steps:**
1. In Admin Panel, click "Create Candidate"
2. Enter:
   - Name: `Test User 1`
   - Email: `test1@example.com`
3. Click "Create"

**Status:** READY TO TEST
**Expected:** Candidate appears in Candidates table

---

### Test 4: Start Candidate Session
**Objective:** Verify session initialization and container spawning

**Steps:**
1. Find `test1@example.com` in Candidates table
2. Click "Start" button
3. Open PowerShell and run:
   ```powershell
   docker ps --filter "name=exam-" --format "table {{.Names}}\t{{.Status}}"
   ```

**Status:** READY TO TEST
**Expected Result:**
- 8 new containers with pattern `exam-{slug}-{role}`
- Browser console shows session initialization
- Session appears in Session Browser panel with "ACTIVE" status

---

### Test 5: Verify Container Names
**Objective:** Confirm correct container naming pattern

**Steps:**
1. After starting candidate, list containers:
   ```powershell
   docker ps --filter "name=exam-" --format "{{.Names}}"
   ```

**Status:** READY TO TEST
**Expected Output Example:**
```
exam-a1b2c3d4-tokyo
exam-a1b2c3d4-osaka
exam-a1b2c3d4-kyoto
exam-a1b2c3d4-g1
exam-a1b2c3d4-g2
exam-a1b2c3d4-g3
exam-a1b2c3d4-g4
exam-a1b2c3d4-phoenix
```

---

### Test 6: Candidate Login and Terminal Access
**Objective:** Test candidate experience and terminal isolation

**Steps:**
1. Open incognito window: http://localhost:8081/login.html?email=test1@example.com
2. Click "Access Tasks"
3. Navigate to any task with terminal
4. Terminal should open
5. In terminal, run:
   ```bash
   hostname
   ip addr show eth0
   ```

**Status:** READY TO TEST
**Expected:**
- Terminal connects successfully
- `hostname` shows `exam-{slug}-{role}` (e.g., `exam-a1b2c3d4-tokyo`)
- IP address is from isolated network

---

### Test 7: Answer Persistence
**Objective:** Verify answers save to session directory

**Steps:**
1. In candidate browser, answer any question
2. Wait 3-5 seconds for auto-save
3. In PowerShell, check:
   ```powershell
   Get-ChildItem "lab\state\sessions" -Recurse -Filter "*.json" | Select-Object FullName
   ```

**Status:** READY TO TEST
**Expected:**
- `sessions/{slug}/metadata.json` exists
- `sessions/{slug}/answers/{taskId}.json` exists
- JSON contains answer data with timestamp

---

### Test 8: Session Browser in Admin Panel
**Objective:** Verify admin can view active session

**Steps:**
1. In Admin Panel, scroll to "Session Browser" panel
2. Click "Refresh" button
3. Click "View" button for the active session

**Status:** READY TO TEST
**Expected:**
- Session table shows 1 active session
- Status badge is green "ACTIVE"
- Shows "8 running" containers
- View modal displays:
  - Session metadata (email, status, timestamps)
  - Container list (8 containers)
  - Answers (if any submitted)
  - Terminal logs (if terminals used)

---

### Test 9: Candidate Submission
**Objective:** Test snapshot and cleanup on submission

**Steps:**
1. In candidate browser, navigate to final page
2. Click "Submit Final Work"
3. Monitor logs:
   ```powershell
   docker-compose logs -f app | Select-String "snapshot|cleanup"
   ```
4. Check containers:
   ```powershell
   docker ps --filter "name=exam-"
   ```
5. Check state preserved:
   ```powershell
   Get-ChildItem "lab\state\sessions\{slug}\docker-snapshots"
   ```

**Status:** READY TO TEST
**Expected:**
- Logs show: `[Submit] Creating session snapshot`
- Logs show: `[Submit] Snapshot complete`
- Logs show: `[Submit] Session cleanup complete`
- All `exam-*` containers removed
- State directory still exists with:
  - `docker-snapshots/` folder
  - `.tar` files for each container
  - `.log` files for container logs
  - `metadata.json` shows `status: "completed"`

---

### Test 10: View Completed Session
**Objective:** Verify admin can review completed session

**Steps:**
1. In Admin Panel, Session Browser
2. Click "Refresh"
3. Click "View" on completed session

**Status:** READY TO TEST
**Expected:**
- Status badge shows "COMPLETED" (orange/red)
- Containers column shows "—" (none running)
- View modal shows all preserved data:
  - Answers
  - Terminal logs
  - Metadata with completion timestamp

---

### Test 11: Multiple Sequential Candidates
**Objective:** Verify isolation between different candidates

**Steps:**
1. Create second candidate:
   - Name: `Test User 2`
   - Email: `test2@example.com`
2. Click "Start" for test2
3. Check containers:
   ```powershell
   docker ps --filter "name=exam-" --format "{{.Names}}"
   ```
4. Verify both session directories exist:
   ```powershell
   Get-ChildItem "lab\state\sessions" -Directory
   ```

**Status:** READY TO TEST
**Expected:**
- Second candidate gets 8 new containers with DIFFERENT prefix
- Both session directories exist independently
- Session Browser shows 2 sessions (1 completed, 1 active)
- No cross-contamination between sessions

---

## Test Summary

**Total Tests:** 11  
**Passed:** 0 (Not yet executed)  
**Failed:** 0  
**Blocked:** 0  
**Ready to Execute:** 11

## Next Actions

1. **Manual Testing:** Follow each test case above and record results
2. **Document Issues:** Note any failures or unexpected behavior
3. **Fix and Retest:** Address issues and re-run failed tests
4. **Deploy to EC2:** Once all tests pass locally

## How to Execute Tests

Open browser and navigate to:
- Application: http://localhost:8081
- Admin Login: http://localhost:8081/admin-login.html (password: 2025)
- Candidate Login: http://localhost:8081/login.html?email=test1@example.com

Use PowerShell commands provided in each test case to verify Docker containers and file system state.

## Notes

- All backend infrastructure is complete and SessionManager is initialized
- Admin panel UI includes new Session Browser panel
- Ready for comprehensive end-to-end testing
- Test results should be recorded in this file as tests are executed
