/**
 * Client helper for the server-attested policy check (POST /api/policy-check).
 * Use this AFTER the local checkLever() pass to get a server confirmation —
 * for the heaviest tools where bypass would be expensive (encrypted-engine
 * jobs, AI model calls). The client check gives instant UX; this gives an
 * audit trail and a tamper-resistant second wall.
 *
 *   const ok = await serverCheckLever('video-convert-format', 'input-size', file.size);
 *   if (!ok) { policyGate.fire(localHit); return; }
 *
 * Network failures FAIL OPEN (return true) — never crash a user's job because
 * of a transient request. Real enforcement remains the local check + the
 * encrypted-engine origin lock; this is defense-in-depth, not the primary gate.
 */

import { checkLever, checkFormat, type LeverType, type LimitHit } from './policy';

interface CheckOk { allowed: true }
interface CheckFail { allowed: false; reason: string }
type CheckResult = CheckOk | CheckFail;

async function postCheck(body: object): Promise<CheckResult> {
  try {
    const r = await fetch('/api/policy-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!r.ok) return { allowed: true } as CheckOk;
    return (await r.json()) as CheckResult;
  } catch {
    return { allowed: true } as CheckOk;
  }
}

export async function serverCheckLever(toolKey: string, lever: LeverType, value: number): Promise<boolean> {
  const r = await postCheck({ toolKey, lever, value });
  return r.allowed;
}

export async function serverCheckFormat(toolKey: string, format: string): Promise<boolean> {
  const r = await postCheck({ toolKey, format });
  return r.allowed;
}

/** Dual-gate spec for enforcePolicy(). One entry per lever to check. */
export type GateSpec =
  | { type: 'lever'; lever: LeverType; value: number }
  | { type: 'format'; format: string };

/**
 * Run client + server checks for a list of levers, in order. On any failure,
 * fire the policy gate (so the user sees the upgrade paywall) and return
 * false. Returns true only when all checks pass — the caller proceeds.
 *
 *   const ok = await enforcePolicy(POLICY_KEY, isPro, fire, [
 *     { type: 'lever', lever: 'input-size', value: file.size },
 *     { type: 'lever', lever: 'input-duration', value: info.duration },
 *     { type: 'format', format: target },
 *   ]);
 *   if (!ok) return;
 *
 * The client check fires INSTANTLY (zero round-trip), so user gets the paywall
 * immediately for the obvious cases. The server check is the second wall —
 * runs only when the client said pass, but might disagree (clone with
 * stripped client guard, tampered Pro flag, etc.). On network error the
 * server check fails open — never blocks a legitimate user.
 */
export async function enforcePolicy(
  toolKey: string,
  isPro: boolean,
  fire: (hit: LimitHit | null) => void,
  specs: GateSpec[],
): Promise<boolean> {
  // 1. Client checks first — instant, free, correct paywall messaging.
  for (const s of specs) {
    const hit = s.type === 'lever'
      ? checkLever(toolKey, s.lever, s.value, isPro)
      : checkFormat(toolKey, s.format, isPro);
    if (hit) { fire(hit); return false; }
  }
  // 2. Server-attested re-check (defense-in-depth). Only run when client said
  //    pass — otherwise it's redundant.
  for (const s of specs) {
    const ok = s.type === 'lever'
      ? await serverCheckLever(toolKey, s.lever, s.value)
      : await serverCheckFormat(toolKey, s.format);
    if (!ok) {
      // Build a fresh hit object as if isPro=false so the paywall renders the
      // accurate friendly message (server said this would block).
      const hit = s.type === 'lever'
        ? checkLever(toolKey, s.lever, s.value, false)
        : checkFormat(toolKey, s.format, false);
      fire(hit);
      return false;
    }
  }
  return true;
}
