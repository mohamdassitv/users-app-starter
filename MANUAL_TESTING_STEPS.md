# Manual Testing Steps for Session Isolation

## Current Status
✅ Application running on http://localhost:8081
✅ SessionManager initialized
✅ No active exam containers
✅ Admin login page open in browser

## Step-by-Step Testing

### 🔐 STEP 1: Admin Login
1. In the browser, you should see the Admin Login page
2. **Enter password:** `2025`
3. Click **"Admin Login"** button
4. **Expected:** Redirected to admin dashboard

---

### 👀 STEP 2: Verify New UI Elements
After successful login, scroll through the admin page and verify:

**Look for these NEW panels:**
- ✓ **"Session Browser"** panel (should show "0" sessions initially)
  - Has a table with columns: Session ID, Candidate, Status, Created, Completed, Containers, Actions
  - Has a "Refresh" button

**Screenshot what you see or confirm the panel exists.**

---

### 👤 STEP 3: Create Test Candidate
1. In the **"Candidates Panel"**, click **"Create Candidate"** button
2. Fill in the form:
   - **Name:** `Test User 1`
   - **Email:** `test1@example.com`
3. Click **"Create"**
4. **Expected:** New candidate appears in the Candidates table

---

### 🚀 STEP 4: Start Candidate Session (CRITICAL TEST)
1. Find `test1@example.com` in the Candidates table
2. Click the **"Start"** button next to their name
3. **Watch for:** The button should disable or change
4. **Open PowerShell** and run:
   ```powershell
   docker ps --filter "name=exam-" --format "table {{.Names}}\t{{.Status}}"
   ```
5. **Expected Output:** You should see 8 new containers like:
   ```
   exam-abc123xy-tokyo      Up X seconds
   exam-abc123xy-osaka      Up X seconds
   exam-abc123xy-kyoto      Up X seconds
   exam-abc123xy-g1         Up X seconds
   exam-abc123xy-g2         Up X seconds
   exam-abc123xy-g3         Up X seconds
   exam-abc123xy-g4         Up X seconds
   exam-abc123xy-phoenix    Up X seconds
   ```

**⚠️ IMPORTANT:** If no containers appear, check:
```powershell
docker-compose logs app | Select-String "initializeSession|error" -Context 2
```

---

### 📊 STEP 5: Check Session Browser
1. Go back to admin page
2. Scroll to **"Session Browser"** panel
3. Click **"Refresh"** button
4. **Expected:** 
   - Badge shows "1" session
   - Table shows one row with:
     - Session ID (shortened, like `abc123xy...`)
     - Candidate: `test1@example.com`
     - Status: **ACTIVE** (green badge)
     - Created timestamp
     - Containers: **"8 running"** (green text)
     - Actions: "View" button and snapshot button (📸)

---

### 👁️ STEP 6: View Session Details
1. In Session Browser, click **"View"** button for the active session
2. **Expected:** Modal opens showing:
   - **Session Info:**
     - Candidate email
     - Status: active
     - Created timestamp
   - **Containers:** List of 8 container names
   - **Answers:** "No answers saved yet" (since candidate hasn't started)
   - **Terminal Logs:** "No terminal logs saved"

---

### 💻 STEP 7: Test Candidate View & Terminal Isolation
1. Open a **new incognito/private window**
2. Navigate to: `http://localhost:8081/login.html?email=test1@example.com`
3. Click **"Access Tasks"**
4. Navigate to any task that has a terminal (e.g., Task 1 or networking task)
5. **Terminal should open** - wait for it to connect
6. In the terminal, type these commands:
   ```bash
   hostname
   ```
   **Expected output:** Should show something like `exam-abc123xy-tokyo` (session-specific)

   ```bash
   ip addr show eth0
   ```
   **Expected:** Should show IP address from isolated network

   ```bash
   ls /
   ```
   **Expected:** Should show Alpine Linux file system

**If terminal doesn't connect:**
```powershell
docker ps --filter "name=exam-"
docker logs exam-[TAB to autocomplete]-tokyo
```

---

### 📝 STEP 8: Test Answer Persistence
1. In the candidate browser (incognito), answer any question
2. Type something in a text field and wait 3-5 seconds (auto-save)
3. **Open PowerShell:**
   ```powershell
   # Find the session directory
   Get-ChildItem "lab\state\sessions" -Directory
   
   # Check for answer files (replace {slug} with actual slug from above)
   Get-ChildItem "lab\state\sessions\*\answers" -Recurse
   ```
4. **Expected:** You should see JSON files with answers

---

### ✅ STEP 9: Submit Exam & Test Snapshot
1. In candidate browser, navigate through tasks
2. Click **"Submit Final Work"** (if available) or find submit button
3. **Monitor in PowerShell:**
   ```powershell
   docker-compose logs -f app
   ```
4. **Watch for these log messages:**
   ```
   [Submit] Creating session snapshot for test1@example.com
   [Submit] Snapshot complete
   [Submit] Session cleanup complete
   ```
5. **After logs appear, check containers:**
   ```powershell
   docker ps --filter "name=exam-"
   ```
   **Expected:** Should be EMPTY (all containers removed)

6. **Check state preserved:**
   ```powershell
   Get-ChildItem "lab\state\sessions\*\docker-snapshots" -Recurse
   ```
   **Expected:** Should see `.tar` and `.log` files

---

### 🔍 STEP 10: View Completed Session
1. Go back to admin page
2. Session Browser panel → Click **"Refresh"**
3. **Expected:**
   - Status badge changed to **"COMPLETED"** (orange/red)
   - Containers shows "—" (none running)
4. Click **"View"** button
5. **Expected:** Modal shows:
   - All preserved answers
   - Terminal logs (if any commands were run)
   - Completion timestamp

---

### 🔄 STEP 11: Test Multiple Candidates (Optional)
Repeat steps 3-9 with a second candidate:
- Name: `Test User 2`
- Email: `test2@example.com`

**Verify:**
1. Second candidate gets DIFFERENT container names (different slug prefix)
2. Both session directories exist independently
3. Session Browser shows 2 sessions
4. No cross-contamination

---

## 🎯 Success Criteria Checklist

- [ ] Admin login works
- [ ] Session Browser panel visible
- [ ] Clicking "Start" spawns 8 Docker containers
- [ ] Containers have correct naming pattern: `exam-{slug}-{role}`
- [ ] Session appears in Session Browser with "ACTIVE" status
- [ ] Terminal connects and shows session-specific hostname
- [ ] Answers save to session directory
- [ ] Submit triggers snapshot (check logs)
- [ ] Containers removed after submission
- [ ] State files preserved in `lab/state/sessions/`
- [ ] Completed session viewable in admin panel
- [ ] View modal shows all session data

---

## 🐛 Troubleshooting Commands

```powershell
# Check app logs for errors
docker-compose logs app | Select-String "error|Error|fail" -Context 2

# Check if SessionManager initialized
docker-compose logs app | Select-String "SessionManager"

# List all exam containers
docker ps -a --filter "name=exam-" --format "table {{.Names}}\t{{.Status}}"

# Check session directories
Get-ChildItem "lab\state\sessions" -Recurse | Select-Object FullName

# Force cleanup if needed
docker ps --filter "name=exam-" -q | ForEach-Object { docker rm -f $_ }
```

---

## 📸 What to Report Back

Please let me know:
1. ✅ Which steps worked successfully
2. ❌ Which steps failed (with error messages)
3. 📋 Screenshots of:
   - Session Browser panel
   - Active session in the table
   - Session details modal
   - Terminal showing hostname
4. 📊 Output of:
   ```powershell
   docker ps --filter "name=exam-"
   Get-ChildItem "lab\state\sessions"
   ```

---

**Ready to start? Begin with Step 1! 🚀**
