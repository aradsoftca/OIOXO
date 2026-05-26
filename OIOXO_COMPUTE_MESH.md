# OIOXO Compute Mesh — "Bring Your Own Compute"

Use the hardware of any device you own to lift the usage limit on another. Code on
a weak device (phone, cheap laptop, iPad); a strong device you own (MacBook, desktop
GPU) does the heavy generation; the work mints **compute credit** the weak device
redeems against its limit. The whole pipeline runs **device-to-device on the same
Wi-Fi** — our server never runs the model, never relays a byte of the work, and only
keeps the limit ledger (which it already does).

This is not a new system; it finishes a seam that is already load-bearing:
`lib/oioxo/remote-coder.ts` (peer + HTTP coders), `lib/oioxo/escalate.ts`
(`'distributed'` tier, `codeSources()` order, `shouldOffloadOracle`),
`lib/oioxo/hardware.ts` (device tiers), `lib/oioxo/tier.ts` (oracle tiers).

## Principle

All inference is already on-device and free, so the usage limit is a **business
nudge**, not a resource cost. The fair, novel lever: **work served by hardware you
own earns credit toward the limit.** You buy your way past the paywall with your own
silicon, or you pay for Pro — both are legitimate.

## Roles

- **Provider** — the device with compute. Runs the model, serves generation over a
  direct channel, and issues a signed **WorkReceipt** for each job.
- **Consumer** — the device you code on. Drives the verified loop locally, borrows
  generation, banks receipts, and redeems them into credit at report-time.
- **Transport** — direct on the LAN. Browser↔browser: WebRTC with a *serverless*
  handshake (QR / manual SDP). Desktop provider: a LAN HTTP endpoint (the literal
  "API device"). Same Wi-Fi means ICE uses host candidates, so no STUN/TURN.

## What touches our server

Only the **limit ledger** (`/api/usage/code`, account-keyed, fails open — see
`lib/oioxo/usage-client.ts`). At report-time the consumer attaches banked receipts;
the server verifies + clamps them and grants credit seconds. No model, no files, no
relay — negligible bytes. Everything else is peer-to-peer.

## WorkReceipt (the "token")

Account-bound, not a tradeable currency (no marketplace, no cross-account transfer →
no regulatory surface). Signed by a per-device key registered to the account.

```
{ v, deviceId, seq, nonce, jobHash, servedSec, tokensOut, issuedAt, sig }
```

- `deviceId` — provider's account-bound device key id.
- `seq` — monotonic per-device counter → replay/duplicate guard.
- `nonce` — random, extra replay guard.
- `jobHash` — fingerprint of (task + input files + output edits); ties the receipt to
  real served work. The consumer can recompute it before banking.
- `servedSec` / `tokensOut` — the work metric the credit is derived from.
- `sig` — signature over the canonical payload (all fields except `sig`).

## Anti-abuse (keeps Pro meaningful)

1. **Account-bound** — you can only earn credit for your own account.
2. **Replay-proof** — server dedupes by `(deviceId, seq)`; rejects stale/duplicate.
3. **Clamped** — `maxPerReceiptSec` per receipt, `dailyCapSec` per day. The daily cap
   is the lever: generous free time for self-hosters (they cost us nothing); Pro keeps
   its value via *no cap + priority + frontier escalation*.
4. **Tied to real work** — `jobHash` + `servedSec`; the cap bounds any inflation.

## Any device is a helper (the fabric)

The system is not "weak device borrows one GPU" — it's a fabric where **every device
advertises a capability profile and the scheduler assigns each the role it's best at.**
A phone on battery is a poor generator but a fine verifier or corpus host.

| Role | What the helper does | Maps to |
|---|---|---|
| `generate` | run the model, propose edits | `remote-coder.ts` |
| `verify`   | run tests/build/typecheck (the oracle) | `remote-oracle.ts` |
| `embed`    | embeddings / semantic retrieval | `embed.ts`, `retrieve.ts` |
| `corpus`   | host the verified-brick library | `bricks.ts` |
| `weights`  | seed model weights to other LAN devices (skip the internet download) | new |
| `preview`  | hold the WebContainer / live preview warm | `webcontainer.ts` |

`lib/oioxo/mesh.ts` — `HelperRegistry`: capability filter + health (in-flight load,
EMA latency, success rate, availability) + ranked selection (`candidates`/`pick`/`pickN`).
Pure, Node-tested.

`lib/oioxo/coder-pool.ts` — `makeCoderPool` turns N generate-capable helpers into one
`GenerateFn`. **race** = first usable result wins (latency = your fastest device);
**best** = keep the highest-scoring responder (parallel best-of-N). Churn-tolerant: a
helper that throws/times-out/returns empty is recorded as a failure and routed around,
never hangs (all-fail → `[]`, a failed attempt the loop retries). Per-helper generator
is injected (prod: a `makePeerCoder` per helper).

## Stages

1. ✅ **Credit core** — `compute-credit.ts`: schema, sign/verify (injected), `CreditLedger`
   with caps + replay guard.
2. ✅ **Provider/consumer wiring** — `remote-coder.ts` carries an optional receipt;
   `serveCoder` measures + issues, `makePeerCoder` banks. Glue in `mesh-receipt.ts`
   (deterministic `jobFingerprint`, `makeReceiptIssuer`, `receiptMatchesJob`).
3. ✅ **Helper fabric + coder pool** — `mesh.ts` + `coder-pool.ts` (above). "Three
   devices = faster" via race/best fan-out with churn tolerance.
4. ✅ **Capability auto-assignment + verify pool** — `capability.ts` (`capabilitiesFor`/
   `canGenerate`/`oracleStrength`/`profileFor`: a device self-assigns roles — battery
   drops `generate`, a phone still does `verify`/`embed`) + `verify-pool.ts`
   (`makeVerifyPool`: `fastest` = first green wins, `agree` = quorum trust against a
   flaky/dishonest verifier; churn-tolerant).
5. ✅ **Peer weight seeding (core)** — `weight-seed.ts`: `planChunks` + `ChunkScheduler`
   (multi-source parallel fetch, drop→reassign, stall→reclaim, progress) + `verifyFile`.
   The new device pulls the model from LAN siblings; byte transport is the injected layer.
6. ✅ **Serverless LAN pairing (core)** — `pairing.ts`: non-trickle SDP exchanged as a
   QR/paste blob (`encodePairing`/`decodePairing`), account `tokenMatches` to reject
   strangers, `waitIceComplete` gate. Skips `/api/signal` entirely.
7. ✅ **Device keys + server reconciliation** — `device-key.ts` (ECDSA P-256 via Web
   Crypto; deviceId = public-key fingerprint, self-authenticating; `Signer`/`Verifier`)
   + `bytes.ts` (b64url) + `credit-server.ts` (`reconcileReceipts`: batch → credit with
   replay/cap, the ONLY server touchpoint). Proven with REAL signatures in the suite.
8. **Binding layer (browser/Tauri)** — wire each pure core to real transport: a
   `makePeerCoder` per fabric helper, remote-oracle per verify helper, RTCPeerConnection
   for `connectPeerLocal`, WebRTC-binary / LAN-HTTP for weight chunks, IndexedDB for the
   device key, the `/api/usage/code` route calling `reconcileReceipts`.
9. **UX** — provider "Lend this device" toggle; consumer "Paired · earning · 3 devices"
   banner.

**Status:** stages 1–7 are complete pure cores, 69/69 Node tests green (incl. real
ECDSA). Everything that remains (stage 8–9) is browser/server binding + UI, which can't
live in the Node suite.

## Pro fit

Pro is not "more usage" alone — that can be self-earned. Pro = no daily credit cap +
priority + automatic frontier/local-big escalation (`escalate.ts`) + the fine-tuned
conductor (`conductor-engine.ts`). The mesh makes the free tier feel generous to people
who bring hardware, without giving away the Pro moat.
