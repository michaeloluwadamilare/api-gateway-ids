# API Endpoints - Planned Test Surface

Endpoint list for the stub backend, prepared for the supervisor meeting per
the sprint feedback ("prepare the list of API endpoints for later testing").

An interactive OpenAPI/Swagger doc for these routes is served by the backend
itself at `/docs` (raw spec at `/openapi.json`) - reachable both directly at
[http://localhost:4000/docs](http://localhost:4000/docs) and through the
gateway at [http://localhost:8080/docs](http://localhost:8080/docs), since
the gateway passes everything through unmodified at this stage. Source:
`backend/src/openapi.js`.

The gateway now enforces JWT on every route except the ones marked "none"
below (`gateway/src/middleware/jwtEnforcement.js`), and runs R1 (SQL/NoSQL
injection) against the URL, query string, and JSON body of every request
that passes JWT enforcement (`gateway/src/middleware/injectionDetection.js`).
JWT enforcement checks *possession of a valid token only* - it deliberately
does **not** check resource ownership, so the BOLA gaps below (`GET
/api/users/:id`, `/api/accounts/:id`) are still open on purpose.

R5 (BOLA/ID enumeration) now runs in **detect-only** mode on the routes
below marked with a numeric `:id` (`gateway/src/middleware/enumerationDetection.js`):
three consecutive requests for ascending IDs from the same composite
identity are logged and scored (+35, Table 2), but the request is never
blocked - a legitimate user paging through their own resources can produce
the same shape, so this needs calibration against real traffic before it's
safe to enforce. The mapping below is what each endpoint is *for*, once the
remaining rules (R2 as a scored rule, R3-R4, Table 2 of the proposal) exist
to act on it.

All routes are reachable two ways during this phase:

- Direct: `http://localhost:4000/...` (bypasses the gateway entirely - useful
  to prove the gateway isn't the source of a bug)
- Through the gateway: `http://localhost:8080/...` (proxied unmodified)

| Method | Path                          | Auth       | Target attack category (Table 4)       | Notes                                             |
|--------|-------------------------------|------------|-----------------------------------------|----------------------------------------------------|
| GET    | `/health`                     | none       | -                                        | Liveness check, answered by gateway and backend both |
| POST   | `/api/auth/register`          | none       | -                                        | Not persisted; exists for endpoint-shape completeness |
| POST   | `/api/auth/login`              | none       | Brute force (API2), Credential stuffing (API2) | Hydra / scripted credential-pair target |
| GET    | `/api/users/:id`               | JWT        | BOLA / Enumeration (API1)               | Sequential numeric IDs, no ownership check |
| GET    | `/api/accounts/:id`             | JWT        | BOLA / Enumeration (API1)               | Sequential numeric IDs, no ownership check |
| GET    | `/api/accounts/:id/transactions`| JWT        | BOLA / Enumeration (API1)               | Same account resource, one level deeper |
| POST   | `/api/accounts/:id/transactions`| JWT        | BOLA / Enumeration (API1)               | Write-side BOLA variant |
| GET    | `/api/transactions/search?q=`  | JWT        | SQL/NoSQL Injection (API8)               | R1 live here - injection-signature payloads get a 403 before reaching the backend |

JWT manipulation (API2:2023) doesn't need a dedicated endpoint - `jwt_tool`
can be pointed at any JWT-protected route above (e.g. `/api/accounts/:id`)
with a tampered token (`none` alg, RS256→HS256 confusion, forged claims);
the gateway's `algorithms: ['RS256']` allowlist rejects all three by
construction (`gateway/src/security/jwt.js`).

## Seeded test data

| User ID | Email               | Password       | Account ID |
|---------|----------------------|----------------|------------|
| 1       | alice@example.com    | Password123!   | 1          |
| 2       | bob@example.com      | Password123!   | 2          |
| 3       | chloe@example.com    | Password123!   | 3          |


