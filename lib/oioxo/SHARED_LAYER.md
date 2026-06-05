# OIOXO — one control plane for web + desktop (identity · billing · entitlement · projects)

The web app (`newxonvert`, oioxo.com) and the desktop IDE (`d:/appz/oioxo-ide`, the
Void fork) must behave **identically** for everything the server governs, and a
project started on one must be openable on the other. The rule:

> **Compute is local (free for us, on the user's device). Control is one shared,
> account-keyed plane on oioxo.com that both surfaces call the same way.**

## 1. Identity — the account is the hub
Everything below is keyed by **account**, not device, so limits/projects follow the
user across machines.

| | Web (oioxo.com) | Desktop (Electron) |
|---|---|---|
| Who am I | NextAuth session cookie; anon = cookie+IP fingerprint | account token in the **OS keychain** (`safeStorage`), obtained via an OAuth deep-link sign-in |
| Sent as | cookie (automatic) | `Authorization: Bearer <token>` |
| Resolves to | same `userId` on the server | same `userId` on the server |

Server change needed: `/api/usage/code` + `/api/entitlement` must accept a bearer
token (desktop) in addition to the session cookie (web) → both map to one `userId`.

## 2. Billing / hourly limits — ONE client, ONE endpoint  ✅ shared
`lib/oioxo/usage-client.ts` `CodeMeter` is host-independent and used by BOTH:
- Web: `new CodeMeter()` (relative `/api/usage/code`, cookie). Wrapped by `useCodeMeter`.
- Desktop: `new CodeMeter({ endpoint: 'https://oioxo.com/api/usage/code', authHeaders: () => ({ Authorization: 'Bearer ' + keychainToken() }) })`, bracketing the OIOXO provider's generation calls (`start()` before, `stop()` in `finally`).
- Server `/api/usage/code` is the single source of truth: free = 3600 s/UTC-day
  (`CODE_FREE_SECONDS_PER_DAY`), activated = unlimited, counted per **account** →
  the same free hour is shared whether the user codes on web or desktop. Hardware,
  not plan, decides WHICH model; the meter only limits free *time*.

## 3. Entitlement / Pro unlock — same gate both  (ported, wiring remains)
`entitlement.ts` · `protect.ts` · `unlock.ts` (ECDHE session gate) · `pro-asset.ts`
are host-independent and already copied to the fork (`contrib/void/browser/oioxo/`).
Both surfaces: device-bound entitlement from `/api/entitlement` → per-session ECDHE
handshake (`/api/code-key`, `/api/ai-key`) → decrypt the protected model. Desktop
delta: `CONTROL_PLANE='https://oioxo.com'`, token in keychain. **The model is inert
without a live handshake — identical on web and desktop.** (Port `unlock.ts` to the
fork next; entitlement/protect/pro-asset already there.)

## 4. Projects — portable across surfaces, "continue from web with no computer"
A project is `{ id, name, files[], meta }`. **Our server never stores project files,
and we never run a setup process to make sync work.** Project *storage* is the user's
own, via mechanisms that need **zero registration or operator involvement** on our
side. The only backends we ship are the ones that are fully self-contained:

| Backend | Where the bytes actually live | Setup we must do | Status |
|---|---|---|---|
| **Local** | working copy (web: IndexedDB sessions/history; desktop: real FS) | none | ✅ both |
| **GitHub** | the user's own repo — the END USER pastes their own fine-grained PAT | none (no OAuth app to register) | ✅ `GitHubWorkspace` (`github.ts`) — the working bridge |
| **File** | a `.zip` the user downloads and re-opens | none | ✅ `zip.ts` |
| **P2P** | device → device over WebRTC (desktop → phone, no relay) | none | ✅ `share.ts` (reuses Send) |

**What we deliberately do NOT build, and why:**
- **No `/api/projects` store** on oioxo.com — no project bytes on our DB/disk/bandwidth.
- **No hosted Drive/Dropbox/OneDrive sync.** A managed-cloud backend can't be fully
  local: OAuth requires *someone* (us, the operator) to register apps and hold client
  IDs. That's operator involvement we've ruled out. So it's intentionally omitted —
  not deferred. (A user-cloud `CloudProvider`/`CloudWorkspace` + PKCE backend was
  built and then removed for exactly this reason; revisit only if the no-operator-
  setup constraint changes.)

**"No computer → continue elsewhere"** is served *without* a hosted account hub: push
to your own GitHub from one device and open it on another, hand the project to another
device directly over P2P, or export/import the `.zip`. The bridge is the user's own
GitHub/file/peer — never our servers, and never anything we have to register.

Conflict rule (GitHub): the in-memory buffer commits changed files as one commit;
`history.ts` keeps a local snapshot timeline. Real 3-way merge is deferred.

## 5. Build order
1. ✅ Shared `CodeMeter` (this commit) — web wraps it; desktop wraps the same.
2. Server: accept a bearer token on `/api/usage/code` + `/api/entitlement` (desktop identity → same account).
3. Desktop: OS-keychain token (safeStorage + IPC) + bracket the OIOXO provider with `CodeMeter.start/stop`.
4. Port `unlock.ts` to the fork; wire the Pro model load through it.
5. Project portability ships today as **GitHub + file export + P2P** — all zero-
   operator-setup, nothing on our servers. No further project-storage backend planned.

Net: one server governs identity, time, and unlock for both surfaces — and nothing
else. Projects ride the user's own GitHub, a downloaded file, or a direct P2P
transfer, so work moves between a desktop and a phone without a single byte living on
our servers and without us registering or operating any third-party integration.
