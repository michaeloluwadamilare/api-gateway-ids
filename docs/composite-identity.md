# Composite Identity

How the gateway attributes requests to a single "attacker" across the
request lifecycle, and where that model breaks down. Referenced by R1, R5,
and every future rule that reads cumulative state from Redis.

## What it is

```
identity = "<client IP>:<JWT subject, or 'anon' if unauthenticated>"
```

Implemented in [`gateway/src/security/identity.js`](../gateway/src/security/identity.js),
computed once per request by `compositeState`
([`gateway/src/middleware/compositeState.js`](../gateway/src/middleware/compositeState.js))
immediately after JWT enforcement, and attached to `req.identity` for every
downstream rule to key its Redis state on:

| Redis key                       | Written by                | Holds |
|----------------------------------|----------------------------|-------|
| `idreq:<identity>`               | `compositeState`           | request count in the current observation window |
| `idscore:<identity>`             | `recordRuleTrigger`        | cumulative rule-weight score (R1 +50, R5 +35, Table 2) |
| `idseq:<identity>:<resourceType>`| `enumerationDetection` (R5)| last 3 numeric resource IDs requested, per resource type |

All three are `EXPIRE`'d to a 600-second sliding observation window
(`OBSERVATION_WINDOW_SECONDS`) - state resets if the identity goes quiet for
ten minutes.

## Why IP alone isn't enough

Section 2.5 of the proposal cites Shafiq et al. (2020) on composite
client-identity features outperforming IP-only attribution. Concretely,
IP-only scoring gets two failure modes wrong in opposite directions:

- **False merging**: NAT and shared corporate/mobile egress IPs put many
  distinct users behind one address. IP-only scoring would let one
  malicious user's score contaminate every legitimate user sharing that IP.
- **False splitting**: a single attacker rotating through a VPN or proxy
  pool looks like many different low-volume identities, none of which cross
  a per-IP threshold individually.

Folding the JWT subject in fixes the *authenticated* half of this: two
users behind the same NAT'd IP get different identities as soon as they log
in (`ip:1` vs `ip:2`), and the same user keeps one identity across IP
changes only if... (see limitations below - it doesn't, actually, which is
the point of documenting this rather than asserting it works).

## Limitations

**Pre-authentication traffic is still IP-only.** Every unauthenticated
request - including the brute-force/credential-stuffing target,
`POST /api/auth/login` itself - collapses to `<ip>:anon`. Composite identity
only starts discriminating between individuals *after* a successful login,
so R3/R4 (not yet built) will need to reason about `ip:anon` explicitly
rather than assuming per-user granularity from the first request.

**An IP change mid-session breaks continuity.** A mobile client switching
from wifi to cellular, or a VPN reconnect, changes `req.ip` mid-attack. The
same authenticated attacker becomes a fresh identity with a fresh score -
the cumulative model resets exactly when a determined attacker is most
likely to be rotating egress points to evade it.

**The 600-second window caps how "low and slow" a detected attack can be.**
Thomas et al. (2017), cited in the proposal, found credential stuffing at
one request per second evades rate-based detection entirely - that
finding motivated cumulative scoring in the first place, but cumulative
scoring only helps within the window it's measured over. An attacker
pacing requests slower than the 10-minute TTL never accumulates a score;
each burst starts from zero. The window is a placeholder, not a calibrated
value - calibration against real attack/legitimate traffic (Phase 5 of the
Implementation Plan) is what will set it properly.

**Token reuse is indistinguishable from the legitimate owner.** If a JWT is
stolen and replayed, composite identity treats the thief as the same
identity as the real user (same `sub`) - which is *correct* behaviour for
attributing activity to a credential, but means identity alone can't detect
the theft itself; that's a separate concern (out of scope for this MVS).

**`req.ip` assumes the gateway is the true first hop.** There's no reverse
proxy in front of the gateway in this topology, so `req.ip` is trustworthy
as-is. If a load balancer or CDN were ever placed in front of it in a
production deployment, `req.ip` would need `app.set('trust proxy', ...)`
and a defined `X-Forwarded-For` trust boundary, or every identity would
resolve to the proxy's IP instead of the client's - noted here so it
doesn't get missed if the topology changes.

**IPv4-mapped IPv6 formatting is a cosmetic footgun, not a security gap.**
Requests proxied through Docker's network commonly present as
`::ffff:192.168.65.1` rather than a bare IPv4 address. Identity strings are
still internally consistent (the same client always maps to the same
string within one Docker network), but this means identity strings aren't
portable between the Docker Compose topology and a bare-metal run - worth
flagging so a `redis-cli KEYS` comparison between two environments doesn't
look like a bug.
