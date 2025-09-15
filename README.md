# Ops 101 Exam Lab – Active Tasks

Two focused on‑shift scenarios:
1. HTTP Gateway Evidence Collection (Alert ALRT-24117)
2. High-Volume User Cleanup (Emergency Duplicate Purge)

## Task 1 – HTTP Gateway Scenario (Alert ALRT-24117)
You investigate elevated error ratio + latency. You must collect first‑hand evidence for:
- Healthy baseline (`/gateway/ok`)
- Authorization denial (`/gateway/forbidden`)
- Upstream failure (`/gateway/bad`)
- Controlled latency sample (`/gateway/delay/1200`)

Dynamic elements (persist for the run):
- Scenario Primary Key (PK)
- Random numeric body tokens for each gateway outcome (must be fetched, not guessed)
- Correlation Trace ID header (`X-Lab-Trace`)

### What You Produce (Task 1)
1. Verified status outcomes (code or accepted synonym) for each path.
2. Latency measurement (ms) of the delay endpoint.
3. Trace ID value and where captured.
4. Scenario PK and the numeric body tokens (confirmation inputs).
5. Short interpretation paragraph (fault domains, escalation suggestion).

## Task 2 – High-Volume User Cleanup
An enterprise customer bulk‑provisioned ~5,000 duplicate placeholder users during a failed HR import. Bulk automation tooling is down for maintenance; you build a stop‑gap console to:
* Page through the 5,000-user dataset.
* Surgically delete erroneous entries (UI updates instantly).
* Add corrected user records (first + last name) for a few examples.
* Capture a shift note: initial total, deleted sample IDs, one added user, and hardening recommendations (audit log, RBAC, concurrency control, bulk batching, soft delete).

Endpoints:
* `GET /api/users?offset=&limit=` – paginated list
* `DELETE /api/users/:id` – remove a user
* `POST /api/users {firstName,lastName}` – add a user (ID auto-increments)

### What You Produce (Task 2)
1. Initial vs final total user count.
2. Deleted ID samples + reason grouping.
3. Added user (ID + names).
4. Hardening recommendation bullets (3–6).

## Run
```powershell
docker compose up --build
# Then open:
http://localhost:8081 (index lists both tasks)
```

## Grading Dimensions
- Accuracy of codes & latency range
- Traceability (header + PK evidence)
- Operational clarity (correct fault domain language)
- Professional presentation (concise, shift‑ready)

## Notes
All other tasks were intentionally removed to narrow focus and reduce noise. The state JSON persists dynamic identifiers across rebuilds unless you delete the volume or state file.
