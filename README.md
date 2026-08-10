# api-gateway-ids

Gateway-level, rule-based intrusion detection for REST APIs - MSc Cybersecurity
dissertation project (University of Plymouth).

This repo currently implements the Phase 1 + first security-functionality
sprint: a Docker Compose environment with a JWT-enforcing gateway, the R1
(SQL/NoSQL injection) detection rule, and Redis-backed composite-identity
request state, in front of a stub backend. The composite-identity cumulative
scoring/tier engine, the remaining rules (R2 as a scored rule, R3-R5), and
the Postgres audit log are not built yet - see
[`docs/api-endpoints.md`](docs/api-endpoints.md) for what's in and out of
scope right now, and the dissertation proposal for the full design.

## Layout

```
gateway/    Express gateway - health check, request logging, pass-through proxy to backend
backend/    Stub REST API (Postgres-backed) standing in for the "protected application"
docs/       Planned API endpoint list, mapped to the OWASP attack categories under test
```

## JWT key setup (one-time)

The gateway enforces RS256 JWTs (RFC 8725: explicit algorithm allowlist,
`none`-alg and RS256/HS256-confusion rejected by construction). The backend
signs with a private key, the gateway verifies with the matching public key
only - generate a keypair once:

```bash
openssl genrsa -out /tmp/jwt_private.pem 2048
openssl rsa -in /tmp/jwt_private.pem -pubout -out /tmp/jwt_public.pem
base64 -i /tmp/jwt_private.pem | tr -d '\n'   # -> JWT_PRIVATE_KEY_B64 (backend)
base64 -i /tmp/jwt_public.pem | tr -d '\n'    # -> JWT_PUBLIC_KEY_B64 (gateway)
```

For Docker, put the values in `docker-compose.yml` under the `backend`/`gateway`
`environment:` blocks (a working demo keypair ships there already). For a
local run, put them in `backend/.env` / `gateway/.env` respectively (see
`.env.example` in each service).

## Running with Docker (recommended)

```bash
docker compose up --build
```

- Gateway: http://localhost:8080
- Backend (direct, bypassing the gateway): http://localhost:4000
- API docs (Swagger UI): http://localhost:8080/docs or http://localhost:4000/docs
- Redis: localhost:6379 (composite-identity request state - `redis-cli KEYS '*'`)

Gateway access logs are written to `gateway/logs/access.log`, and security
events (JWT rejections, R1 injection blocks) to `gateway/logs/security.log`,
both on the host via the volume mount in `docker-compose.yml`.

Tear down with `docker compose down`.

## Running locally without Docker

Requires Node 20+, a local PostgreSQL instance, and a local Redis instance
(composite-identity request state) - the backend persists to Postgres
(`backend/src/models/`), and the gateway won't start without Redis reachable
(`gateway/src/redisClient.js`).

One-time setup on macOS (Homebrew):

```bash
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis

# match backend/.env.example: DB_USER=api_user, DB_PASSWORD=api_password, DB_NAME=api_ids_db
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
psql -d postgres -c "CREATE ROLE api_user LOGIN PASSWORD 'api_password';"
createdb -O api_user api_ids_db
```

The backend creates its own tables and seed data on startup (`src/db/init.js`)
- no migrations to run by hand. Then, two terminals (after generating the
JWT keypair above and pasting the base64 values into each `.env`):

```bash
# terminal 1
cd backend
cp .env.example .env   # then fill in JWT_PRIVATE_KEY_B64
npm install
npm run dev

# terminal 2
cd gateway
cp .env.example .env   # then fill in JWT_PUBLIC_KEY_B64
npm install
npm run dev
```

## Verifying the gateway: auth, and R1 blocking a malicious request

With either the Docker or local setup running:

```bash
# health check, unauthenticated
curl http://localhost:8080/health

# log in (public route) - returns a real RS256 JWT, not a stub token
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Password123!"}' | jq -r .token)

# no token -> blocked by the gateway's JWT enforcement, backend never sees it
curl -i http://localhost:8080/api/accounts/1

# valid token -> proxied through, 200 from the backend
curl -i http://localhost:8080/api/accounts/1 -H "Authorization: Bearer $TOKEN"

# legitimate query -> passes through normally
curl -i "http://localhost:8080/api/transactions/search?q=Tesco" -H "Authorization: Bearer $TOKEN"

# malicious query (R1 SQL/NoSQL injection signature) -> 403, blocked at the gateway
curl -i "http://localhost:8080/api/transactions/search?q=' OR '1'='1" -H "Authorization: Bearer $TOKEN"
```

The blocked request never reaches the backend (no corresponding line in the
backend's own logs for that `X-Request-Id`), while the legitimate one does -
that contrast is the demo. Check `gateway/logs/security.log` for the JSON
security events (JWT rejections and R1 blocks, each with rule id, composite
identity, and action taken), and `redis-cli KEYS '*'` (or
`docker compose exec redis redis-cli KEYS '*'`) to see the per-identity
request counters and R1 score building up.

## Next up

Per supervisor feedback (Sprint 1 review): ethics update (PEOS), then Phase 2
design sign-off before the rule engine (R1-R5) and Redis-backed scoring are
built on top of this skeleton.
