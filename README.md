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

## Admin API for Bulk / Destructive Operations

User deletions and dataset resets are now restricted to a separate hardened service that is intentionally unusable from a normal browser (CORS blocked). The UI on port 8081 is read‑only for deletions and will respond 405 for `DELETE /api/users/:id` with a guidance message.

Service: `http://localhost:8082`

Authentication:
- Send header: `Authorization: Bearer <ADMIN_TOKEN>`
- Token source: environment variable `ADMIN_TOKEN` (fallback reads `admin/token.txt` inside the container). The sample token in this repo: `exam-secret-123` (change in production!).

Anti‑Console / CORS Hardening:
- Any request presenting an `Origin` header or using the preflight `OPTIONS` method responds `403 {"error":"CORS blocked"}` with no `Access-Control-Allow-*` headers. This blocks typical browser fetch/XHR usage and forces controlled tooling (curl, Python script, etc.).

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/health | Simple health probe `{ ok: true }` |
| GET | /admin/users?offset=&limit= | (Optional) Paginated listing for verification |
| DELETE | /admin/users/:id | Delete a single user (204 No Content) |
| POST | /admin/reset | Rebuild the 5,000-user dataset from seed |

### Example: Delete One User (id 42)
```bash
curl -i -H "Authorization: Bearer exam-secret-123" -X DELETE http://localhost:8082/admin/users/42
```

Expected response (on success): `204 No Content`

### Example: Reset Dataset
```bash
curl -s -H "Authorization: Bearer exam-secret-123" -X POST http://localhost:8082/admin/reset | jq
```

### Python Script to Delete a List of IDs
```python
import requests

BASE = "http://localhost:8082"
TOKEN = "exam-secret-123"  # replace in real use
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

def delete_ids(ids):
	for uid in ids:
		r = requests.delete(f"{BASE}/admin/users/{uid}", headers=HEADERS)
		if r.status_code == 204:
			print(f"Deleted {uid}")
		else:
			print(f"Failed {uid}: {r.status_code} {r.text}")

if __name__ == "__main__":
	sample = [10,11,12]
	delete_ids(sample)
```

### Operational Rationale
- Separation of duties: destructive actions run on isolated port + token.
- Defense-in-depth: Browser-originated deletes blocked (reduces accidental or scripted abuse from exam UI context).
- Deterministic rebuild: `/admin/reset` ensures a known 5,000-user baseline.

### Changing the Token
1. Edit `admin/token.txt` or supply an environment variable at runtime:
   ```powershell
   $Env:ADMIN_TOKEN = "new-secret-value"
   docker compose up --build -d
   ```
2. Verify:
   ```bash
   curl -H "Authorization: Bearer new-secret-value" http://localhost:8082/admin/health
   ```

### Quick Health Check
```bash
curl -s http://localhost:8082/admin/health
```

