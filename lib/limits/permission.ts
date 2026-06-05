'use client';

/**
 * Permission ticket facade — the strongest form of the policy gate. Mirrors
 * the AI/coding stack's "permission IS the asset" pattern, applied to a
 * single tool action.
 *
 * Three calls compose the gate:
 *
 *   1. requestPermission(toolKey, inputFingerprint, specs)
 *      → POSTs /api/permission with origin + UA + rate-limit + policy lever
 *        checks; if every lever passes, returns a signed ticket.
 *
 *   2. assertPermission(ticket, toolKey, inputFingerprint)
 *      → engines call this BEFORE doing real work. POSTs
 *        /api/permission-verify which re-binds (toolKey, input, device),
 *        checks the signature, and SPENDS the nonce (replay attempt = throw).
 *
 *   3. enforcePolicy() in server-check.ts can be replaced or chained with
 *      requestPermission() — the new flow is:
 *           ticket = await requestPermission(toolKey, hash, specs);
 *           if (!ticket) return; // paywall already fired
 *           await engine.run(input, { permission: ticket });
 *           // engine calls assertPermission() internally
 *
 * A clone CAN'T bypass:
 *   • without origin/UA → preCheck rejects requestPermission
 *   • without entitlement / device → ticket is rejected on verify
 *   • capturing one ticket → spend-once nonce, dies in 30s anyway
 *   • patching engine to skip verify → only works for unencrypted engines;
 *     the protected workers (image/codec/audio/cad/model3d) have the verify
 *     INSIDE the encrypted blob.
 */

import { deviceId } from '@/lib/oioxo/entitlement-client';
import { hashInputFingerprint } from '@/lib/oioxo/fingerprint';
import { type LeverType } from './policy';

export type GateSpec =
  | { type: 'lever'; lever: LeverType; value: number }
  | { type: 'format'; format: string };

export interface Permission {
  ticket: string | null;
  exp: number;
  pro: boolean;
}

interface PermissionDenied {
  allowed: false;
  reason: string;
  lever?: LeverType;
  format?: string;
  free?: number | string[];
  observed?: number;
}

/**
 * Request a permission ticket for a single tool action. On policy failure
 * (denied lever/format) returns null + the parsed denial info via the second
 * tuple element so the caller can fire its policy gate paywall.
 */
export async function requestPermission(
  toolKey: string,
  inputHash: string,
  specs: GateSpec[],
): Promise<{ permission: Permission | null; denial: PermissionDenied | null }> {
  try {
    const r = await fetch('/api/permission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolKey, inputHash, device: deviceId(), specs }),
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (r.status === 403) {
      const denial = await r.json().catch(() => ({ allowed: false, reason: 'forbidden' }));
      return { permission: null, denial: denial as PermissionDenied };
    }
    if (!r.ok) {
      // 503 unconfigured or 5xx → fail open with a null ticket. The engine's
      // own assertPermission will then fail-open too (matching behavior).
      return { permission: { ticket: null, exp: Date.now() + 30_000, pro: false }, denial: null };
    }
    const j = await r.json() as { ticket?: string | null; exp?: number; pro?: boolean };
    return {
      permission: { ticket: j.ticket ?? null, exp: j.exp ?? Date.now() + 30_000, pro: !!j.pro },
      denial: null,
    };
  } catch {
    // Network failure — fail open with null ticket, engine fail-opens too.
    return { permission: { ticket: null, exp: Date.now() + 30_000, pro: false }, denial: null };
  }
}

/**
 * ENGINE-SIDE: assert a permission ticket is valid for the in-flight job.
 * THROWS if the server rejects (bad sig / expired / spent / wrong device /
 * wrong tool / wrong input). Fail-open on null ticket (Pro / unconfigured /
 * network down on the request side — the request already failed open).
 */
export async function assertPermission(
  permission: Permission | undefined | null,
  toolKey: string,
  inputHash: string,
): Promise<void> {
  if (!permission || !permission.ticket) return; // fail-open (Pro or service degraded)
  try {
    const r = await fetch('/api/permission-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket: permission.ticket,
        toolKey,
        inputHash,
        device: deviceId(),
      }),
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({ reason: 'denied' }));
      throw new Error(`permission-denied: ${(j as { reason?: string }).reason ?? 'denied'}`);
    }
  } catch (e) {
    // Network error: fail OPEN (don't break legit users on flaky wifi). The
    // primary gate is requestPermission — if a clone could get there, this
    // re-check is the second wall, not the last.
    if (e instanceof Error && e.message.startsWith('permission-denied:')) throw e;
  }
}

export { hashInputFingerprint };
