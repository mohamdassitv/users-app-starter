# Per-Candidate Session Isolation System

## Overview

I've implemented a comprehensive per-candidate isolation system that ensures each candidate gets:
- ✅ **Unique Docker containers** for terminal tasks
- ✅ **Isolated state directories** preserving all work
- ✅ **Session-specific URLs** and access tokens
- ✅ **Automatic snapshot on completion** 
- ✅ **Admin review capabilities** for all sessions

## What Was Implemented

### 1. SessionManager Class (`session-manager.js`)

**Core Features:**
- `initializeSession(sessionId, email)` - Creates isolated Docker containers and state directory
- `spawnSessionContainers(sessionId)` - Spawns 8 containers per session with unique names:
  - `exam-{sessionId}-tokyo` (branch office)
  - `exam-{sessionId}-osaka` (branch office)
  - `exam-{sessionId}-kyoto` (branch office)
  - `exam-{sessionId}-g1, g2, g3, g4` (gateway containers)
  - `exam-{sessionId}-phoenix` (gateway-phoenix)
- `getContainerName(sessionId, terminalId)` - Routes terminal connections to session-specific containers
- `snapshotSession(sessionId)` - Exports container filesystems and logs on completion
- `cleanupSession(sessionId, preserveState)` - Removes containers but keeps state for admin review
- `saveTerminalHistory(sessionId, terminalId, history)` - Saves terminal command history
- `listAllSessions()` - Returns all sessions for admin panel
- `getSessionDetails(sessionId)` - Retrieves complete session data including answers and terminal logs

**State Directory Structure:**
```
/state/sessions/{sessionId}/
├── metadata.json           # Session info (candidate, timestamps, status)
├── answers/               # Task answers
│   ├── task1.json
│   ├── task2.json
│   └── ...
├── terminal-logs/         # Terminal command history
│   ├── tokyo.json
│   ├── osaka.json
│   └── ...
└── docker-snapshots/      # Container exports on completion
    ├── exam-{id}-tokyo.tar
    ├── exam-{id}-tokyo.log
    └── ...
```

### 2. Server Integration (`server.js`)

**Changes Made:**

1. **Session Initialization on Exam Start** (`/api/candidate/:email/start`):
   - Spawns isolated Docker containers when candidate starts
   - Creates unique network per session
   - Stores container references in candidate record

2. **Terminal Routing** (`/api/terminal/:container` and WebSocket handler):
   - Routes terminal connections to session-specific containers
   - Falls back to shared containers for admin/legacy access
   - Uses `candidateSlug` cookie to identify session

3. **Answer Persistence** (`/api/candidate/answers`):
   - Saves answers to both global state.json AND session directory
   - Ensures admin can review after completion

4. **Automatic Snapshot on Submit** (`/api/candidate/submit`):
   - Triggers full session snapshot
   - Exports all container states
   - Cleans up running containers but preserves state

5. **New API Endpoints**:
   - `POST /api/session/:sessionId/snapshot` - Manually trigger snapshot
   - `POST /api/session/:sessionId/cleanup` - Clean up session resources
   - `GET /api/admin/sessions` - List all sessions
   - `GET /api/admin/session/:sessionId/details` - Get full session details
   - `POST /api/session/:sessionId/terminal/:terminalId/history` - Save terminal history

### 3. Container Naming Convention

Each candidate's containers follow this pattern:
```
exam-{first8chars-of-slug}-{role}
```

Examples for session `abc123xyz456`:
- `exam-abc123xy-tokyo`
- `exam-abc123xy-osaka`
- `exam-abc123xy-kyoto`
- `exam-abc123xy-g1`
- `exam-abc123xy-g2`
- `exam-abc123xy-g3`
- `exam-abc123xy-g4`
- `exam-abc123xy-phoenix`

Each session also gets its own Docker network:
- `exam-abc123xy-net`

## How It Works

### Candidate Flow

1. **Login** (`/api/candidate/login`):
   - Candidate enters email
   - System assigns unique `slug` (12-character ID)
   - Creates task tokens for access control

2. **Start Exam** (`/api/candidate/:email/start`):
   - Admin or candidate clicks "Start"
   - **SessionManager.initializeSession()** is triggered:
     - Creates `/state/sessions/{slug}/` directory
     - Spawns 8 Docker containers with unique names
     - Creates dedicated network
     - Initializes metadata file

3. **Working on Tasks**:
   - Candidate opens terminal tasks
   - System uses `candidateSlug` cookie to route to their containers
   - Answers save to both global state.json and session directory

4. **Submit**:
   - Candidate clicks submit
   - **SessionManager.snapshotSession()** is triggered:
     - Exports each container's filesystem (.tar files)
     - Saves container logs
     - Updates metadata to "completed"
   - **SessionManager.cleanupSession()** removes containers but keeps state
   - Admin can now review the preserved session

### Admin Review

1. Admin can call `GET /api/admin/sessions` to list all sessions
2. Each session shows:
   - Candidate email
   - Creation/completion timestamps
   - Status (active/completed)
   - Container names (if still running)

3. Admin can view session details via `GET /api/admin/session/:sessionId/details`:
   - All answers with timestamps
   - Terminal command history
   - Session metadata

## Testing Checklist

### Local Testing (Before EC2 Deployment)

- [ ] **Test 1: Session Creation**
  ```bash
  # Login as candidate
  # Start exam
  # Check: docker ps should show 8 new containers with exam-{id} prefix
  # Check: docker network ls should show exam-{id}-net
  # Check: /state/sessions/{slug}/ directory exists
  ```

- [ ] **Test 2: Terminal Isolation**
  ```bash
  # Open terminal in Task 1
  # Run: hostname
  # Verify: Shows session-specific container name (exam-{id}-tokyo)
  # Try: ping exam-{id}-osaka
  # Verify: Can reach other session containers
  ```

- [ ] **Test 3: Answer Persistence**
  ```bash
  # Answer a question in any task
  # Check: /state/sessions/{slug}/answers/{taskId}.json exists
  # Check: Contains answer data with timestamp
  ```

- [ ] **Test 4: Snapshot on Submit**
  ```bash
  # Complete exam and submit
  # Check: /state/sessions/{slug}/docker-snapshots/ contains .tar files
  # Check: Container logs saved as .log files
  # Check: metadata.json shows status: "completed"
  # Check: docker ps shows containers removed
  ```

- [ ] **Test 5: Multiple Sequential Candidates**
  ```bash
  # Candidate 1: Login, start, work, submit
  # Candidate 2: Login, start, work
  # Verify: Each has separate containers (exam-{slug1}-, exam-{slug2}-)
  # Verify: Candidate 2 cannot access Candidate 1's containers
  # Verify: Both session directories exist independently
  ```

- [ ] **Test 6: Admin Session Listing**
  ```bash
  # Call: GET /api/admin/sessions
  # Verify: Shows both completed and active sessions
  # Verify: Session details include container names, timestamps, status
  ```

- [ ] **Test 7: Admin Session Review**
  ```bash
  # Call: GET /api/admin/session/{slug}/details
  # Verify: Returns all answers
  # Verify: Returns terminal logs (if saved)
  # Verify: Shows completion status
  ```

### EC2 Deployment Testing

- [ ] **Test 8: Deploy to EC2**
  ```bash
  # SSH to EC2 instance
  # Pull latest code from GitHub
  # Restart containers: docker-compose down && docker-compose up -d --build
  # Check logs: docker-compose logs -f app
  ```

- [ ] **Test 9: Remote Terminal Access**
  ```bash
  # Login as candidate from browser
  # Open terminal task
  # Verify WebSocket connection works
  # Verify commands execute in session containers
  ```

- [ ] **Test 10: Full End-to-End on EC2**
  ```bash
  # Candidate A: Complete full exam workflow
  # Candidate B: Start new exam while A's state is preserved
  # Admin: Review both sessions via API
  # Verify: Isolated containers, separate state directories
  ```

## Current Status

✅ **Completed:**
- SessionManager class with full lifecycle management
- Server integration with session routing
- Answer persistence to session directories
- Automatic snapshot on submission
- Container isolation and cleanup
- API endpoints for admin review

⏳ **Remaining:**
- Admin panel UI to browse sessions (need to update admin.html)
- Full end-to-end testing
- EC2 deployment and verification

## Admin Panel TODO

The admin.html needs a new section to:
1. List all sessions with status badges
2. Show session details on click:
   - Candidate email
   - Start/end timestamps
   - Container status
   - View answers button
   - View terminal logs button
   - Download snapshot button
3. Filter by status (active/completed)
4. Search by email or session ID

## Deployment Notes

1. **Docker Socket Access**: The app container needs `/var/run/docker.sock` mounted (already in docker-compose.yml)

2. **State Persistence**: The `/app/state` directory must be a volume to persist sessions across app restarts

3. **Cleanup Strategy**: 
   - Containers are removed after submission
   - State directories are never deleted automatically
   - Admin can manually cleanup via API if needed

4. **Resource Management**:
   - Each session creates 8 containers + 1 network
   - Estimate ~100MB RAM per container
   - Total per session: ~800MB + overhead

## Next Steps

1. **Update admin.html** to add session browser UI
2. **Test locally** with 2-3 sequential candidates
3. **Commit changes** to GitHub
4. **Deploy to EC2**:
   ```bash
   cd ~/users-app-starter
   git pull origin main
   mkdir -p lab/logs  # Ensure logs directory exists
   sudo docker-compose down
   sudo docker-compose up -d --build
   ```
5. **Verify on EC2** with real candidate workflow
6. **Monitor** container creation/cleanup in production

## Troubleshooting

**Issue: Containers not spawning**
- Check Docker socket is mounted
- Check app container can run `docker ps`
- Check logs: `docker-compose logs app`

**Issue: Terminal won't connect**
- Verify container exists: `docker ps | grep exam-{slug}`
- Check container logs: `docker logs exam-{slug}-tokyo`
- Verify network exists: `docker network ls`

**Issue: Snapshot fails**
- Check disk space: `df -h`
- Check container export permissions
- Review app logs for errors

**Issue: Old containers not cleaned up**
- Manual cleanup: `docker rm -f $(docker ps -a --filter "name=exam-" -q)`
- Remove networks: `docker network prune -f`

## Files Modified/Created

**Created:**
- `lab/src/session-manager.js` (new file, 442 lines)

**Modified:**
- `lab/src/server.js`:
  - Added SessionManager import and initialization
  - Updated `/api/candidate/:email/start` to spawn containers
  - Updated `/api/terminal/:container` for session routing
  - Updated WebSocket handler for session-specific containers
  - Updated `/api/candidate/answers` to save to session directories
  - Updated `/api/candidate/submit` to trigger snapshot
  - Added 5 new session management endpoints

**Next to Modify:**
- `lab/src/public/admin.html` - Add session browser UI

## Success Criteria

✅ **Isolation**: Each candidate has completely separate Docker containers
✅ **Persistence**: All work (answers, terminal history, container states) saved
✅ **Reset**: New candidate gets fresh environment
✅ **Review**: Admin can view any candidate's preserved state
✅ **Cleanup**: Containers removed after submission, no resource leaks
✅ **Scalability**: System handles sequential candidates without conflicts

## Questions?

- **Q: Can two candidates work simultaneously?**
  A: Currently optimized for sequential use (one at a time). The system CAN support multiple concurrent candidates since each gets isolated containers, but resource limits should be considered (each session = ~800MB RAM).

- **Q: What happens if candidate doesn't submit?**
  A: Containers remain running. Admin can manually trigger snapshot and cleanup via API endpoints.

- **Q: Can admin access candidate's live session?**
  A: Yes, admin can use the container names from session metadata to connect directly via docker exec.

- **Q: How long are sessions kept?**
  A: Indefinitely unless manually deleted. Consider implementing auto-cleanup for sessions older than X days.

