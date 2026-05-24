# oioxo — licensing & anti-piracy spec

How oioxo earns revenue from a **local app running local models** without hosting
inference, and makes a cracked copy worthless instead of chasing impossible DRM.
Builds directly on what already shipped for the site: the WASM brain core, the
`encrypt.mjs` asset encryption, the `/api/brain-key` server gate + per-deploy key
rotation, and the Postgres usage meter (`lib/usage/*`).

## 0. The honest principle (do not forget it)

Client-side code can never be made uncopyable. The goal is **not** "uncrackable" —
it is: **the cracked copy is worthless, and the legit copy is so cheap + convenient
that cracking isn't worth anyone's time.** Two truths follow:

- A check you can *remove* is worthless. The only robust gate is one whose output
  you **cannot run without** — "the check delivers the asset."
- The durable moat is the **fine-tuned models** (writer8, conductor): their value
  can't be read off the wire and can't be reproduced without our data + pipeline.
  A stolen client with no live weights is an empty shell. Spend protection budget
  on **weight/brain delivery**, not on locking the free editor.

## 1. Business shape: host keys + freshness, never compute

The user's GPU runs inference. We host only tiny things: license validation, the
content-key endpoint, the encrypted-asset CDN, the usage meter. Consequences:

- **COGS ≈ 0** → we can price under the inference-paying incumbents and still keep
  better margins. Local models are a *pricing weapon*, not a liability.
- The gate is cheap and rate-limitable.
- Works **offline after a one-time authed unlock**, within a grace window.

## 2. Pricing

| Tier | Price | What | Why it's safe |
|---|---|---|---|
| **Free** | $0 | Full editor + base on-device coder + the verified loop; **server-metered caps** on the network features (search, type-grab, big-model downloads, sync). Hourly/daily/monthly allowance lives here. | Caps enforced server-side on network features — never a local counter (trivially patched). |
| **Pro** | $8–12/mo (annual discount) | Everything unlocked: bigger on-device models, frontier BYOK passthrough, all AI + tools, cloud sync, priority brain updates. | Subscription → periodic revalidation *is* the enforcement. |
| **Lifetime** | $199–299 once | Anti-subscription crowd. | Still revalidates periodically for the encrypted Pro assets — "lifetime updates," not "offline forever." |
| **Teams** | later | seats, shared recipes, admin | — |

Free-tier metering reuses `lib/usage/*` (cookie+IP composite identity, Postgres),
applied to the **network features** of the coding agent. Pro = unlimited.

## 3. The gate: "the check delivers the asset" (no fallback)

The site kept a TS fallback so the brain still ran without the key (safe for an
open site). **The product does not.** The Pro brain — conductor weights, prompt
programs, orchestration recipes, capability data — ships **encrypted** and runs
**only** as decrypted bytecode/weights. Remove the check → no content key → no
brain. You can't patch your way to data you were never sent.

```
sign in → server checks subscription + device + not-revoked
        → issues: signed ENTITLEMENT (claims, short TTL)
                + CONTENT KEY (CK) for the assets this tier is entitled to
client  → decrypt Pro assets with CK → run in WASM (NO TS fallback for Pro)
        → cache CK + entitlement for offline grace, until exp
revalidate every N hours / on reconnect → fresh CK or denial
```

- **Free brain** may keep an open base path (it's the funnel/marketing). Only the
  **Pro** surface is hard-gated.

## 4. Layers (each = the site's piece, made stronger)

| Site has | Product adds |
|---|---|
| WASM brain core, **TS fallback kept** | WASM brain core, **no Pro fallback** |
| `/api/brain-key`, origin-gated | **Account + device-bound, short-TTL signed entitlement** + revalidation (the "short-lived token" the site listed as not-built) |
| strong obfuscation transforms OFF (broke inline workers) | desktop/IDE build has no inline-worker constraint → **control-flow-flattening / string-array / self-defending ON** for the license + loader bundle |
| per-deploy key rotation | **per-user keyed + watermarked Pro weights** → leaks traceable, keys revocable; rotation kills leaked keys next release |
| Postgres usage meter | same meter enforces **free-tier limits on server-gated features** |
| — | **velocity as defense:** frequent brain updates → cracked snapshots rot (stale conductor/recipes = worse coding over time) |

## 5. Components (this build)

- **`entitlement.ts`** — mint (server) + verify a signed, device-bound, short-TTL
  entitlement (claims: subject, device, tier, features, iat, exp). TTL + offline
  grace logic. Pure + Node-testable. *(The signature is checked server-side; the
  client merely presents the token — the real boundary is §3's content key.)*
- **`protect.ts`** — AES-256-GCM encrypt/decrypt Pro assets with a content key;
  HKDF **per-user key derivation** (each user's assets keyed to them → leak is
  traceable); a per-user **watermark** tag embedded in the asset header. Pure +
  Node-testable round-trip.
- **`/api/entitlement`** (design) — NextAuth session + tier + device + rate-limit
  → returns `{ entitlement, contentKey }`. Reuses brain-key's origin defense + the
  usage meter. Rotates CK per release (reuse the deploy rotation already wired).
- **Loader** — extends the existing `wasm-bridge`/`encrypt.mjs` path: Pro assets
  fetched encrypted, decrypted with CK from `/api/entitlement`, run with **no
  fallback**; cache CK for the grace window.

## 6. The trade-off we accept (state it plainly)

Hard anti-piracy and pure-forever-offline are in tension. Pragmatic choice (same
as the site): **Pro works offline after a periodic authed unlock + grace window.**
Free tier is more offline-tolerant; Pro accepts a light tether because that tether
*is* the protection. The free local core *will* leak — that's the funnel, not a
failure. Protect the Pro/weights layer; let the free base be the ad.

Relates to [[project_anti_copy]] (WASM core + key gate + rotation), [[project_usage_gate]]
(free metering), [[project_custom_model]] (the fine-tuned moat), [[project_ai_platform_vision]].
