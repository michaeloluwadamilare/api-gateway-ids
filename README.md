# api-gateway-ids

Gateway-level, rule-based intrusion detection for REST APIs - MSc Cybersecurity
Dissertation project (University of Plymouth).

An Express API gateway sits in front of a deliberately vulnerable banking API
and inspects every request with five detection rules mapped to the OWASP API
Security Top 10. It can run in two modes: **static** (block on first rule hit)
and **adaptive** (accumulate a per-identity risk score and respond in tiers) -
and ships with an experiment harness that attacks the system under each
condition and measures detection accuracy and latency overhead.

---

## Contents

1. [Architecture](#architecture)
2. [Repository layout](#repository-layout)
3. [Prerequisites](#prerequisites)
4. [Quick start (Docker)](#quick-start-docker)
5. [Running locally without Docker](#running-locally-without-docker)
6. [Trying the IDS by hand](#trying-the-ids-by-hand)
7. [Detection rules](#detection-rules)
8. [Static vs adaptive mode](#static-vs-adaptive-mode)
9. [Configuration reference](#configuration-reference)
10. [Logs and the tamper-evident audit trail](#logs-and-the-tamper-evident-audit-trail)
11. [Running the tests](#running-the-tests)
12. [Running the experiments](#running-the-experiments)
13. [Troubleshooting](#troubleshooting)
14. [Security notes](#security-notes)

---

## Architecture

```
  clients/attack scripts / legitimate traffic (scripts/)
                         │
                         ▼
               ┌───────────────────┐        ┌────────────────────────────┐
               │  gateway  :8080   │◄──────►│ Redis :6379                │
               │                   │        │ per-identity counters,     │
               │  JWT enforcement  │        │ risk scores, blocklist     │
               │  R1–R5 rules      │        └────────────────────────────┘
               │  tier policy      │        ┌────────────────────────────┐
               │  audit logging    │───────►│ Postgres :5432             │
               └─────────┬─────────┘        │ audit_log (hash-chained)   │
                         │ proxied if       │ + backend's app tables     │
                         │ allowed          └────────────────────────────┘
                         ▼                               ▲
               ┌───────────────────┐                     │
               │  backend:4000   │─────────────────────┘
               │  banking REST API │
               └───────────────────┘
```

The **backend** is intentionally insecure: it performs no token checks and no
object-ownership checks (any caller can read any account by ID). The gateway
is the only line of defence, which is what makes it a fair test of the IDS.

Every request through the gateway passes this middleware chain
([gateway/src/app.js](gateway/src/app.js)):

```
requestId → auditLog → access log → JSON body parser
  → jwtEnforcement (R2) → compositeState (identity = "<ip>:<user sub|anon>")
  → blocklistCheck → credentialStuffingGate (R4) → rateAbuseDetection (R3)
  → injectionDetection (R1) → enumerationDetection (R5)
  → tierPolicyEngine → proxy to backend
```

---

## Repository layout

```
backend/            Vulnerable banking API (Express + Postgres), signs RS256 JWTs
gateway/            The IDS gateway
  src/middleware/   One file per pipeline stage/detection rule
  src/security/     JWT verification, injection signatures, identity, R4 logic
  src/audit/        Hash-chained audit logger + chain verifier
  test/             Jest unit tests (Redis and Postgres mocked)
  logs/             access.log and security.log (mounted from the container)
scripts/            Experiment harness (zero dependencies, Node built-ins only)
  attacks/          One attack generator per rule, plus multi-vector scenarios
  traffic/          Legitimate-user traffic generator
  lib/              Shared config, HTTP client, metrics, Docker control
  perf/             k6 load-test script and token minting
kong/               Kong CE declarative config (reference baseline)
results/            Timestamped JSON output from experiment runs
docker-compose.yml  Redis, Postgres, backend, gateway (+ optional Kong)
```

---

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) (with Compose v2) | recent | Running the stack — **required for the experiment harness** |
| [Node.js](https://nodejs.org/) | 20 or newer | Running tests, the harness, or the services without Docker |
| `curl` and [`jq`](https://jqlang.github.io/jq/) | any | The manual walkthrough below |
| [k6](https://k6.io/docs/get-started/installation/) | any | Performance experiments only (`npm run performance`) |
| PostgreSQL 16 + Redis 7 | — | Only if running **without** Docker |

Check what you have:

```bash
docker --version && docker compose version
node -v
jq --version
k6 version        # optional
```

---

## Quick start (Docker)

This is the recommended way to run the project.

### Step 1 — Clone the repository

```bash
git clone <repository-url> api-gateway-ids
cd api-gateway-ids
```

### Step 2 — (Optional) Generate your own JWT keypair

`docker-compose.yml` already contains a working **demo** keypair, so you can
skip this step for local use. To use your own:

```bash
openssl genrsa -out /tmp/jwt_private.pem 2048
openssl rsa -in /tmp/jwt_private.pem -pubout -out /tmp/jwt_public.pem
base64 -i /tmp/jwt_private.pem | tr -d '\n'   # → JWT_PRIVATE_KEY_B64 (backend)
base64 -i /tmp/jwt_public.pem  | tr -d '\n'   # → JWT_PUBLIC_KEY_B64  (gateway)
```

Paste the two values into the `backend` and `gateway` `environment:` blocks of
`docker-compose.yml`. The backend only ever holds the private key; the gateway
only ever holds the public key.

### Step 3 — Build and start the stack

```bash
docker compose up --build -d
```

This starts four containers: `api-ids-redis`, `api-ids-postgres`,
`api-ids-backend` and `api-ids-gateway`. On first start the backend creates
its tables and seeds test users; the gateway creates its `audit_log` table.

### Step 4 — Wait for everything to be healthy

```bash
docker compose ps
```

All four services should show `healthy`. Then:

```bash
curl http://localhost:8080/health
```

### Step 5 — Explore

| URL | What it is |
|---|---|
| http://localhost:8080 | The gateway (use this) |
| http://localhost:8080/docs | Swagger UI, via the gateway |
| http://localhost:4000 | The backend directly — **bypasses the IDS** |
| `localhost:6379` | Redis (`docker compose exec redis redis-cli KEYS '*'`) |
| `localhost:5432` | Postgres (user `postgres`, password `postgres`, db `api_ids_db`) |

Seeded users (all with password `Password123!`):

| ID | Email |
|---|---|
| 1 | `alice@example.com` |
| 2 | `bob@example.com` |
| 3 | `chloe@example.com` |


### Stopping

```bash
docker compose down        # stop containers, keep nothing in Redis/Postgres
docker compose logs -f gateway   # (while running) follow gateway output
```

### Optional — Kong reference gateway

A stock Kong CE gateway with simple rate limiting (120 req/min) is available
as a comparison baseline:

```bash
docker compose --profile reference up -d kong
# proxy on http://localhost:8000, admin API on http://localhost:8001
```

---

## Running locally without Docker

Use this if you want to run the Node services directly (e.g. with `nodemon`
for development). The experiment harness still expects Docker, so use the
Docker setup for experiments.

### Step 1 — Install and start Postgres and Redis (macOS / Homebrew)

```bash
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis
```

### Step 2 — Create the database and user

These match the defaults in the `.env.example` files.

```bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
psql -d postgres -c "CREATE ROLE api_user LOGIN PASSWORD 'api_password';"
createdb -O api_user api_ids_db
```

No migrations are needed — both services create their own tables on startup.

### Step 3 — Generate a JWT keypair

Follow [Step 2 of the Docker quick start](#step-2--optional-generate-your-own-jwt-keypair)
(or reuse the base64 values already in `docker-compose.yml`).

### Step 4 — Start the backend (terminal 1)

```bash
cd backend
cp .env.example .env      # then set JWT_PRIVATE_KEY_B64=<base64 private key>
npm install
npm run dev               # listens on http://localhost:4000
```

### Step 5 — Start the gateway (terminal 2)

```bash
cd gateway
cp .env.example .env      # then set JWT_PUBLIC_KEY_B64=<base64 public key>
npm install
npm run dev               # listens on http://localhost:8080
```

The gateway refuses to start if it cannot reach Redis or Postgres.

---

## Trying the IDS by hand

Works with either setup. The gateway starts in **adaptive** mode by default.

> **Tip:** all `curl` calls from your machine share one identity
> (`<your ip>:<user>`), so scores accumulate across commands. Reset state at
> any time with:
>
> ```bash
> docker compose exec redis redis-cli FLUSHALL    # Docker
> redis-cli FLUSHALL                              # local
> ```

### 1. Log in and get a token

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Password123!"}' | jq -r .token)
echo "$TOKEN"
```

### 2. JWT enforcement (R2)

```bash
# no token → 401, the backend never sees the request
curl -i http://localhost:8080/api/accounts/1

# valid token → proxied, 200 from the backend
curl -i http://localhost:8080/api/accounts/1 -H "Authorization: Bearer $TOKEN"
```

Note the `X-IDS-Tier` and `X-IDS-Score` response headers on proxied requests.

### 3. Injection detection (R1) in adaptive mode

```bash
redis-cli FLUSHALL   # or the docker compose exec variant

# legitimate search → passes
curl -i "http://localhost:8080/api/transactions/search?q=Tesco" \
  -H "Authorization: Bearer $TOKEN"

# first injection attempt → score 50, tier T2: forwarded with a delay
curl -i "http://localhost:8080/api/transactions/search?q=%27%20OR%20%271%27%3D%271" \
  -H "Authorization: Bearer $TOKEN"

# second attempt → score 100, tier T4: 403 and the identity is blocklisted
curl -i "http://localhost:8080/api/transactions/search?q=%27%20OR%20%271%27%3D%271" \
  -H "Authorization: Bearer $TOKEN"

# even a clean request is now refused until the blocklist expires (10 min)
curl -i http://localhost:8080/api/accounts/1 -H "Authorization: Bearer $TOKEN"
```

### 4. Switch to static mode and compare

```bash
GATEWAY_MODE=static docker compose up -d gateway
docker compose exec redis redis-cli FLUSHALL

# a single injection attempt is now blocked immediately with 403
curl -i "http://localhost:8080/api/transactions/search?q=%27%20OR%20%271%27%3D%271" \
  -H "Authorization: Bearer $TOKEN"

# back to adaptive
docker compose up -d gateway
```

(For a local run, change `GATEWAY_MODE` in `gateway/.env` and restart.)

### 5. BOLA / ID enumeration (R5)

```bash
docker compose exec redis redis-cli FLUSHALL
for id in 1 2 3; do
  curl -s -o /dev/null -w "users/$id → %{http_code}\n" \
    http://localhost:8080/api/users/$id -H "Authorization: Bearer $TOKEN"
done
```

The third sequential ID triggers R5 — blocked in static mode, scored in
adaptive mode.

### 6. See what the IDS recorded

```bash
tail -f gateway/logs/security.log                       # one JSON line per rule hit
docker compose exec redis redis-cli KEYS '*'            # live per-identity state
docker compose exec postgres psql -U postgres -d api_ids_db \
  -c "SELECT id, method, path, status_code, tier, score, rules_triggered FROM audit_log ORDER BY id DESC LIMIT 10;"
```

---

## Detection rules

| Rule | Threat (OWASP API Top 10 2023) | How it detects | Default weight |
|---|---|---|---|
| **R1** | SQL / NoSQL injection | 7 OWASP-CRS-inspired regexes over decoded URL, query and body ([injectionSignatures.js](gateway/src/security/injectionSignatures.js)) | 50 |
| **R2** | Broken authentication — JWT abuse (API2) | RS256-only verification with the public key; rejects missing, expired, `alg:none`, RS256→HS256 confusion and forged tokens ([jwt.js](gateway/src/security/jwt.js)) | 50 |
| **R3** | Rate abuse / flooding (API4) | Per-identity counter: more than 60 requests in 10 s ([rateAbuseDetection.js](gateway/src/middleware/rateAbuseDetection.js)) | 30 |
| **R4** | Credential stuffing / brute force (API2) | Counts consecutive login 401s; after 5, weight grows exponentially (40, 80, 160…); success resets ([credentialStuffing.js](gateway/src/security/credentialStuffing.js)) | 40 |
| **R5** | BOLA / sequential ID enumeration (API1) | Last 3 IDs requested under `/api/users/:id` or `/api/accounts/:id` are consecutive ([enumerationDetection.js](gateway/src/middleware/enumerationDetection.js)) | 35 |

Requests are tracked by a **composite identity**  `<client ip>:<JWT sub or "anon">`
 so users behind a shared IP aren't lumped together, and an attacker can't
shed their history just by switching accounts.

---

## Static vs adaptive mode

Set with `GATEWAY_MODE` (default `adaptive`).

**Static** (experimental condition B) — any rule hit blocks that request
immediately with 403/429. Precise but blunt.

**Adaptive** (condition C) — a rule hit adds its weight to the identity's risk
score in Redis (expires after 10 minutes of inactivity), and the tier policy
engine responds proportionally:

| Tier | Score | Response |
|---|---|---|
| T1 Normal | 0–30 | Forwarded normally |
| T2 Elevated | 31–60 | Forwarded after a 150 ms delay |
| T3 High | 61–85 | 750 ms delay; 1 in 10 forwarded, the rest get 429 `challenge required` |
| T4 Critical | 86+ | 403, identity blocklisted for 10 minutes |

R2 always blocks in both modes (a request without a valid token can't proceed),
but still contributes to the score.

---

## Configuration reference

All values are environment variables. In Docker they are passed through from
your shell (e.g. `R3_THRESHOLD=40 docker compose up -d gateway`); locally they
go in `gateway/.env`.

| Variable | Default | Purpose |
|---|---|---|
| `GATEWAY_MODE` | `adaptive` | `adaptive` or `static` |
| `DISABLED_RULES` | *(empty)* | Comma-separated rules to switch off, e.g. `R3,R5` (ablation) |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-For` for the client IP. The harness sets this to `true` |
| `EXPERIMENT_RUN_LABEL` | *(empty)* | Tag written to every audit row |
| `R1_WEIGHT` … `R5_WEIGHT` | 50 / 50 / 30 / — / 35 | Rule score weights (`R4_BASE_WEIGHT` = 40) |
| `R3_WINDOW_SECONDS` / `R3_THRESHOLD` | 10 / 60 | Rate window and request limit |
| `R4_WINDOW_SECONDS` / `R4_THRESHOLD` / `R4_EXPONENTIAL_FACTOR` | 600 / 5 / 2 | Login-failure window, threshold, escalation factor |
| `TIER1_MAX` / `TIER2_MAX` / `TIER3_MAX` | 30 / 60 / 85 | Tier score boundaries |
| `BLOCKLIST_TTL_SECONDS` | 600 | How long a T4 identity stays blocked |
| `T2_DELAY_MS` | 150 | Delay applied at T2 |
| `T3_FORWARD_RATIO` / `T3_DELAY_MS` | 0.1 / 750 | Fraction forwarded and delay at T3 |

Service settings (`PORT`, `BACKEND_URL`, `REDIS_URL`, `DB_*`,
`JWT_PUBLIC_KEY_B64` / `JWT_PRIVATE_KEY_B64`) are documented in each service's
`.env.example`.

---

## Logs and the tamper-evident audit trail

| Output | Location | Contents |
|---|---|---|
| Access log | `gateway/logs/access.log` | One line per request |
| Security log | `gateway/logs/security.log` | JSON event per rule trigger: rule, identity, action, score |
| Audit log | Postgres table `audit_log` | One row per request: identity, mode, status, tier, score, rules triggered, latency |

Each `audit_log` row stores `sha256(previous row hash + this row's fields)`,
forming a hash chain. To check that no row has been edited, deleted or
reordered:

```bash
# Docker
docker compose exec gateway npm run verify-audit-chain

# local
cd gateway && npm run verify-audit-chain
```

---

## Running the tests

The gateway has a Jest suite covering every rule, the tier engine, JWT
verification and the audit hash chain. Redis and Postgres are mocked, so no
containers are needed.

```bash
cd gateway
npm install
npm test
```

Linting and formatting:

```bash
npm run lint          # ESLint
npm run format:check  # Prettier
```

---

## Running the experiments

The harness in `scripts/` reproduces the dissertation's evaluation. It has no
npm dependencies, but it **drives Docker directly** (restarting the gateway
with different settings and flushing Redis between runs), so the Docker stack
must be running.

### Experimental conditions

| Condition | Target | Meaning |
|---|---|---|
| **A** | backend `:4000` | Unprotected baseline |
| **B** | gateway, `static` | Traditional block-on-match IDS |
| **C** | gateway, `adaptive` | Score-and-tier IDS |

Each run launches one attack (as user chloe, from a synthetic IP) concurrently
with legitimate traffic (alice and bob), so both detections and false positives
are measured.

### Step-by-step

```bash
# 1. Make sure the stack is up and healthy
docker compose up --build -d
docker compose ps

# 2. Move into the harness
cd scripts

# 3. (Optional) Calibrate thresholds against legitimate + attack traffic
npm run calibrate

# 4. Main comparative experiment
#    node runExperiment.js <A|B|C|all> <R1|R2|R3|R4|R5|all> [repetitions=5]
node runExperiment.js all all 5

# 5. Ablation study — condition C with each rule disabled in turn
node runAblation.js 5

# 6. Performance overhead (requires k6)
npm run performance
node runPerformance

# 7. Targeted validation scenarios
npm run validate-r3
npm run validate-multivector
npm run validate-distributed-stuffing
```

Every run writes a timestamped JSON report to `results/`
(e.g. `results/experiment-2026-10-04T16-26-30-095Z.json`) containing confusion
matrices (run-level and request-level), precision, recall, F1, false-positive
rate, time-to-detect and latency statistics.

> Experiments restart the gateway container. When you're done, run
> `docker compose up -d gateway` to return it to its default configuration.

### Harness options

| Variable | Default | Used by |
|---|---|---|
| `GATEWAY_URL` / `BACKEND_URL` | `http://localhost:8080` / `:4000` | All scripts |
| `CALIBRATION_LEGIT_REQUESTS` | 500 | `calibrate` |
| `CALIBRATION_RUNS_PER_CATEGORY` | 5 | `calibrate` |
| `CONCURRENCY_LEVELS`, `LOAD_DURATION_MS`, `LOAD_WARMUP_MS`, `LOAD_REPEAT_COUNT`, `PERF_TOKEN_POOL_SIZE` | see [runPerformance.js](scripts/runPerformance.js) | `performance` |
