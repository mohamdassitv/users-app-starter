# Ops 101 Exam Lab – Active Tasks

## NEW: Multi-Candidate Login / Per-Candidate Timer (Cookie‑Gated)
The lab now supports multiple candidates, each with an isolated 4‑hour timer AND server‑side gating (you cannot view tasks until logged in).

Flow:
1. Open the root `/` – you will be redirected to `/login.html` unless you already have a candidate session cookie.
2. Enter Full Name + Email (email acts as unique login key) and submit.
3. Server creates/updates the candidate via `POST /api/candidate/login`, sets an HttpOnly `cand` cookie, then the browser is redirected to `/tasks.html` (protected).
4. Start your personal timer with the Start button (`POST /api/candidate/:email/start`). This is independent of the legacy global exam timer (global still present for backward compatibility, but hidden when a candidate is active).
5. Timer + candidate badge are rendered in the header on every protected page.

Switching Candidates:
- Use the “Switch candidate” link on the tasks page; this clears local storage AND calls `/api/auth/logout` to clear the `cand` cookie, then returns you to the login page.
- Sessions persist server-side (`state.candidates[]`) so refreshing or returning later resumes remaining time.

Key Endpoints:
- `POST /api/candidate/login {email,name}` → upsert candidate (no start).
- `GET /api/candidate/:email` → candidate status (remaining time, running flag).
- `POST /api/candidate/:email/start` → idempotent start (sets `startTime` if not set).
- Admin list (password header) `GET /api/admin/candidates`.

State Shape Example:
```json
{
	"candidates": [
		{ "email": "alice@example.com", "name": "Alice A.", "startTime": "2025-09-25T12:00:00.000Z", "durationMs": 14400000 }
	]
}
```

Client Persistence:
- Display still reads from `localStorage` for the candidate name/email, but **authorization is enforced by the HttpOnly cookie** (`cand`).
- If the cookie is missing you are redirected to `/login.html`, even if localStorage values remain.
- If a stored candidate no longer exists server-side, the header script clears local storage and reverts (after logout) to requiring a new login.

Styling:
- Candidate identity appears as a pink gradient pill (`.candidate-badge`) left of the timer.

Backward Compatibility:
- Original `/api/exam/*` endpoints remain; if no candidate is logged in the header uses the global exam state.

Reset Behavior:
- Admin reset (`POST /api/admin/reset-all`) clears all candidates, timers, scenario, users, contacts, case study, uploads metadata & notes seed (except core template files).

---

## Authentication & Sessions

Type | Mechanism | Cookie | Redirect Rules
---- | --------- | ------ | --------------
Candidate | Email + Name (`POST /api/candidate/login`) | `cand=<email>` (HttpOnly) | Access to `/tasks.html` & `/task/*` requires cookie.
Admin | Password form (`/admin-login.html`, password `2025`) | `admin=1` (HttpOnly) | Visiting `/admin.html` without cookie redirects to `/admin-login.html`.

Logging Out:
- Candidate: Switch link triggers `/api/auth/logout` (clears `cand`).
- Admin: Logout button on `admin.html` calls `/api/auth/admin-logout` (clears `admin`).

Legacy Header Method:
- Admin API endpoints still accept `X-Admin-Password: 2025` for compatibility, but the UI now relies on the cookie.

Security Notes (Training Scope):
- Candidate start endpoint is deliberately open so candidates self-start; admin UI can also start them (idempotent). Harden with server-side auth if exposing externally.
- File-based state makes race conditions possible; acceptable for lab scale.

---

Three focused operational tasks (renumbered with new Case Study as Task 1):
1. Branch Performance Degradation Case Study (Japan Bank – Osaka branch)
2. HTTP Gateway Evidence Collection (Alert ALRT-24117)
3. High-Volume User Cleanup (Emergency Duplicate Purge)

---

## Task 1 – Branch Performance Degradation (Case Study)
Customer **Japan Bank** operates three branch sites (Tokyo, Osaka, Kyoto) each with an on‑prem **EDGE** router. All three connect upstream to a shared **VeloCloud Gateway** which forwards aggregated traffic to **Harmony Connect Cloud**. Only **Osaka** reports slow browsing; other branches are nominal.

You must: 
1. Produce a topology diagram (or descriptive equivalent) of the path: Branch EDGE (3) → VeloCloud GW → Harmony Connect Cloud.
2. Structure an investigative narrative: localized vs shared failure domains (access circuit, CPE resource, overlay path, gateway saturation, cloud egress, DNS, MTU, jitter, packet loss).
3. Provide evidence-driven next-step recommendation (what to measure next & escalation target).

### Case Study Page
Open: `/task/casestudy.html`

Features:
- Rich-text editor (basic formatting + code blocks).
- Draft auto-save (localStorage) until submission.
- Image upload (PNG/JPG/SVG, ≤2MB each, max 6) via `/api/upload`.
- Single immutable submission (locks after first submit).
- Server strips `<script>` tags and length caps content (20k chars) before persisting.

### Submission Persistence
State stored in `state/state.json` under `caseStudy`. Full HTML + meta also written to `submissions/<timestamp>/`. A simulated email log entry is appended to `logs/submissions.log` referencing configured recipients/on-call contact.

### What You Produce (Task 1)
1. Diagram (uploaded image(s)).
2. Failure domain hypothesis matrix (what is isolated vs shared, quick elimination tests).
3. Key metrics you would collect next (latency/jitter per segment, loss, CPU/mem on EDGE, gateway health, DNS timing, MTU probe).
4. Recommendation & escalation path (which team/system next and why).

---

## Task 2 – HTTP Gateway Scenario (Alert ALRT-24117)
Investigate elevated error ratio + latency using endpoints:
- `GET /gateway/ok` – success body token
- `GET /gateway/forbidden` – 403 body token
- `GET /gateway/bad` – 502 body token
- `GET /gateway/delay/1200` – induced latency sample (ms capped)

Dynamic elements (persist until reset):
- Scenario PK (`/api/scenario`)
- Random numeric body token per gateway path
- Correlation header `X-Lab-Trace`

### What You Produce (Task 2)
1. Verified HTTP status outcomes for each path.
2. Measured latency (ms) of delay endpoint.
3. Trace ID and capture location.
4. Scenario PK + numeric body tokens.
5. Interpretive paragraph (fault domains, escalation suggestion).

---

## Task 3 – High-Volume User Cleanup
Bulk placeholder users (~5,000) require surgical deletion & sample correction:
- Paginate dataset.
- Delete erroneous IDs.
- Add corrected users.
- Record operational note (initial total, deleted samples, one added user, hardening ideas).

Endpoints:
- `GET /api/users?offset=&limit=`
- `DELETE /api/users/:id`
- `POST /api/users {firstName,lastName}`

### What You Produce (Task 3)
1. Initial vs final total.
2. Deleted ID samples + reason grouping.
3. Added user (ID + names).
4. 3–6 hardening bullets (audit log, RBAC, concurrency control, bulk batching, soft delete, rate limiting).

---

## Admin Workflow (Updated)
Login Flow:
1. Visit `/admin-login.html` and enter password `2025`.
2. On success an HttpOnly `admin` cookie is set and you are redirected to `/admin.html`.
3. The admin page auto-verifies the session and reveals all panels (no inline password box anymore).

Panels on `admin.html`:
- Candidates: Live list (name, email, timer status) with ability to start any not-yet-started candidate and refresh list.
- Case Study Distribution: Manage recipients + on-call contact used for simulated email log entry when case study is submitted.
- Candidate Submission: View rendered HTML of the case study (once submitted) + JSON metadata.
- Maintenance: Full reset of exam state.

Admin Logout:
- Click Logout in the Admin Session panel → cookie cleared → redirected back to login.

Key Admin Endpoints (cookie or header auth):
- `GET /api/admin/candidates`
- `GET /api/admin/config`
- `POST /api/admin/config {recipients,onCall}`
- `POST /api/admin/reset-all`

### Candidate Case Study Endpoints
- `POST /api/upload` (multipart field `image`)
- `POST /api/case-study/submit {html,images}`
- `GET /api/case-study/submission`

Legacy reset `/api/exam/reset-all` still exists (password in body) but admin route is preferred.

---

## Run
### With Docker (new simplified setup)
```powershell
docker compose build
docker compose up -d
Start-Sleep -Seconds 3
docker compose ps
# Open in browser:
http://localhost:8081
```

Environment variables:
- PORT (default 8081)
- ADMIN_PASSWORD (default 2025 – override for harder password)

To override admin password at runtime:
```powershell
$env:ADMIN_PASSWORD='My$ecret123'; docker compose up --build
```

### Without Docker (local Node.js)
```powershell
cd lab
npm install
$env:ADMIN_PASSWORD='2025'
npm start
```

---

## Grading Dimensions (Holistic)
- Technical accuracy (codes, tokens, timing evidence)
- Traceability & reproducibility (PK, headers, artifacts)
- Analytical depth (failure domain isolation & justification)
- Operational clarity (succinct, shift-ready narrative)
- Professional presentation (structure, prioritization)

---

## Notes
Dynamic state persists in `state/state.json` until an admin reset. Case study submission is immutable—use draft capability carefully before finalizing. Uploaded images live under `public/uploads/`.

---

## Real-Time Collaborative Notes Dock
A global slide-up dock provides a shared Quill editor seeded from a persisted plain‑text file (`state/collab-notes.txt`). This file now survives restarts and acts as the single source of truth for starting content across the entire exam.

Usage:
1. The dock auto-opens once (fullscreen) unless dismissed. Reopen via the floating “Notes” button.
2. Type / format (bold, headers, lists, code blocks, colors, etc.).
3. Export HTML for a point-in-time offline snapshot.

Persistence & Seeding:
- Server seeds the Yjs document from `state/collab-notes.txt` when the first client connects.
- Updates are debounced (≈800ms) and written back to the same file, so restarts retain the evolving shared notes.
- To change the initial template for future sessions, edit `state/collab-notes.txt` before candidates begin.

Removed Import Workflow:
- User-driven DOCX import/export buttons were removed; the exam now enforces a single canonical shared document from start to finish.
- If a Word starting point is desired, convert it externally and paste / adapt into `state/collab-notes.txt` (or implement a one-time pre-seed converter server-side).

Transport:
- WebSocket endpoint: `ws(s)://<host>/collab?room=global-collab-v1`
- Single global room (can be split per task in future enhancements).

Current Limitations:
- Still using a simplified full-text reconciliation (adequate for modest size). Upgrading to granular delta binding would improve efficiency.
- No auth / role-based access (training context only).
- No version history / rollback (could add periodic snapshots of `collab-notes.txt`).

Potential Roadmap:
- Delta-based rich formatting CRDT binding.
- Append-only operational log (for audit / grading traceability).
- Read-only freeze after exam end or case study submission.
- Task-scoped rooms for clearer compartmentalization.
- PDF / DOCX exporter (server-side) if required for archival.

Security Note: This sandbox omits authentication on the collaboration channel. Add token or session enforcement before multi-tenant or external exposure.

---

## Recent Hardening Enhancements
Date: 2025-09-25

1. Per-Candidate Only Timer: Global fallback timer removed from UI; header now hides completely unless a valid candidate session cookie is present.
2. Candidate Status Privacy: `GET /api/candidate/:email` now requires that the requesting browser either owns that candidate cookie or holds an admin session.
3. Self Endpoint: Added `GET /api/candidate/me` for client-side polling without exposing arbitrary emails.
4. Start Protection: `POST /api/candidate/:email/start` limited to that candidate or admin (no cross‑starting other users).
5. Login Redirect: Visiting `/login.html` while already authenticated redirects to `/tasks.html` (prevents page spoof attempts and re-login guessing).
6. Security Headers: Added CSP, X-Frame-Options (DENY), X-Content-Type-Options, Referrer-Policy, and a restrictive Permissions-Policy.
7. Content Security Policy: Locks scripts to self + required CDNs (Quill/CKEditor) and disables framing & object embeds.
8. Hidden Timer When Logged Out: Reduces side-channel timing guesses about exam progress.

Planned (Optional): Basic rate limiting on auth endpoints, server-side logging of auth attempts, integrity nonces for inline style allowances, and WebSocket auth token gating for collaboration channel.
