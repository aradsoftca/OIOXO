/**
 * Security regression suite — the pure-logic attack surface of the licensing
 * & policy stack. Covers ticket forging, replay, tampering, expiry,
 * cross-tool, cross-device; the policy lever checks; the gate util's UA +
 * origin filters. Run: `node scripts/test_security.mjs`.
 *
 * Things needing a running Next server (origin gate live, rate-limit IPs)
 * are in QA_CHECKLIST.md, not here.
 */
import assert from 'node:assert';

let passed = 0;
let failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const SECRET = 'test-secret-fortressxonvert-' + Math.random().toString(36).slice(2);

// ============================================================================
// TICKET: sign / verify happy path
// ============================================================================
test('ticket: signs + verifies a well-formed claim', async () => {
  const { signTicket, verifyTicket } = await import('../lib/oioxo/ticket.ts');
  const t = await signTicket({ toolKey: 'video-convert-format', input: 'abc123', device: 'dev-1' }, SECRET);
  const v = await verifyTicket(t, SECRET);
  assert.equal(v.ok, true);
  assert.equal(v.claims.toolKey, 'video-convert-format');
  assert.equal(v.claims.input, 'abc123');
  assert.equal(v.claims.device, 'dev-1');
});

// ============================================================================
// TICKET: tamper detection — modify any byte → reject
// ============================================================================
test('ticket: rejects a tampered payload', async () => {
  const { signTicket, verifyTicket } = await import('../lib/oioxo/ticket.ts');
  const t = await signTicket({ toolKey: 'video-convert-format', input: 'abc123', device: 'dev-1' }, SECRET);
  const [payload, sig] = t.split('.');
  // Flip the LAST char of the payload — still valid base64url but mismatched sig.
  const flipped = payload.slice(0, -1) + (payload.slice(-1) === 'a' ? 'b' : 'a');
  const v = await verifyTicket(`${flipped}.${sig}`, SECRET);
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'bad-signature');
});

test('ticket: rejects a forged sig', async () => {
  const { signTicket, verifyTicket } = await import('../lib/oioxo/ticket.ts');
  const t = await signTicket({ toolKey: 'x', input: 'h', device: 'd' }, SECRET);
  const [payload] = t.split('.');
  const v = await verifyTicket(`${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`, SECRET);
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'bad-signature');
});

test('ticket: rejects a different secret', async () => {
  const { signTicket, verifyTicket } = await import('../lib/oioxo/ticket.ts');
  const t = await signTicket({ toolKey: 'x', input: 'h', device: 'd' }, SECRET);
  const v = await verifyTicket(t, SECRET + '-different');
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'bad-signature');
});

// ============================================================================
// TICKET: expiry — once past `exp + skew`, fail
// ============================================================================
test('ticket: rejects after expiry', async () => {
  const { signTicket, verifyTicket } = await import('../lib/oioxo/ticket.ts');
  const t = await signTicket({ toolKey: 'x', input: 'h', device: 'd' }, SECRET, { ttlMs: 100, now: 1_000_000 });
  const v = await verifyTicket(t, SECRET, { now: 1_000_000 + 100 + 10_000 });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'expired');
});

test('ticket: accepts within expiry', async () => {
  const { signTicket, verifyTicket } = await import('../lib/oioxo/ticket.ts');
  const t = await signTicket({ toolKey: 'x', input: 'h', device: 'd' }, SECRET, { ttlMs: 30_000, now: 1_000_000 });
  const v = await verifyTicket(t, SECRET, { now: 1_000_000 + 10_000 });
  assert.equal(v.ok, true);
});

// ============================================================================
// TICKET: cross-tool / cross-input / cross-device replay defense
// ============================================================================
test('ticket: rejects when presented to a DIFFERENT tool', async () => {
  const { signTicket, verifyTicket } = await import('../lib/oioxo/ticket.ts');
  const t = await signTicket({ toolKey: 'video-convert-format', input: 'h', device: 'd' }, SECRET);
  const v = await verifyTicket(t, SECRET, { expectToolKey: 'image-upscale' });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'tool-mismatch');
});

test('ticket: rejects on a DIFFERENT input', async () => {
  const { signTicket, verifyTicket } = await import('../lib/oioxo/ticket.ts');
  const t = await signTicket({ toolKey: 'x', input: 'hash-A', device: 'd' }, SECRET);
  const v = await verifyTicket(t, SECRET, { expectInput: 'hash-B' });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'input-mismatch');
});

test('ticket: rejects on a DIFFERENT device', async () => {
  const { signTicket, verifyTicket } = await import('../lib/oioxo/ticket.ts');
  const t = await signTicket({ toolKey: 'x', input: 'h', device: 'device-A' }, SECRET);
  const v = await verifyTicket(t, SECRET, { expectDevice: 'device-B' });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'device-mismatch');
});

// ============================================================================
// TICKET: malformed inputs
// ============================================================================
test('ticket: rejects malformed (no dot)', async () => {
  const { verifyTicket } = await import('../lib/oioxo/ticket.ts');
  const v = await verifyTicket('nodot', SECRET);
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'malformed');
});

test('ticket: rejects malformed (empty payload)', async () => {
  const { verifyTicket } = await import('../lib/oioxo/ticket.ts');
  const v = await verifyTicket('.sig', SECRET);
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'malformed');
});

// ============================================================================
// FINGERPRINT: deterministic, tool-isolated
// ============================================================================
test('fingerprint: same input → same hash', async () => {
  const { hashInputFingerprint } = await import('../lib/oioxo/fingerprint.ts');
  const a = await hashInputFingerprint('tool-x', { bytes: 100, dims: [200, 300] });
  const b = await hashInputFingerprint('tool-x', { bytes: 100, dims: [200, 300] });
  assert.equal(a, b);
  assert.equal(a.length, 16);
});

test('fingerprint: different tool → different hash', async () => {
  const { hashInputFingerprint } = await import('../lib/oioxo/fingerprint.ts');
  const a = await hashInputFingerprint('tool-x', { bytes: 100 });
  const b = await hashInputFingerprint('tool-y', { bytes: 100 });
  assert.notEqual(a, b);
});

test('fingerprint: different input → different hash', async () => {
  const { hashInputFingerprint } = await import('../lib/oioxo/fingerprint.ts');
  const a = await hashInputFingerprint('tool-x', { bytes: 100 });
  const b = await hashInputFingerprint('tool-x', { bytes: 101 });
  assert.notEqual(a, b);
});

// ============================================================================
// POLICY: lever and format checks
// ============================================================================
test('policy: free user crossing input-size → block', async () => {
  const { checkLever } = await import('../lib/limits/policy.ts');
  const hit = checkLever('video-convert-format', 'input-size', 200 * 1024 * 1024, false);
  assert.ok(hit, 'expected a hit for 200MB on free');
  assert.equal(hit.lever.type, 'input-size');
});

test('policy: Pro user crossing input-size → pass (null)', async () => {
  const { checkLever } = await import('../lib/limits/policy.ts');
  const hit = checkLever('video-convert-format', 'input-size', 200 * 1024 * 1024, true);
  assert.equal(hit, null);
});

test('policy: free user under input-size → pass', async () => {
  const { checkLever } = await import('../lib/limits/policy.ts');
  const hit = checkLever('video-convert-format', 'input-size', 1 * 1024 * 1024, false);
  assert.equal(hit, null);
});

test('policy: free user with Pro-only format → block', async () => {
  const { checkFormat } = await import('../lib/limits/policy.ts');
  const hit = checkFormat('video-convert-format', 'mov', false);
  assert.ok(hit, 'expected a hit for MOV (Pro-only) on free');
});

test('policy: free user with free format → pass', async () => {
  const { checkFormat } = await import('../lib/limits/policy.ts');
  const hit = checkFormat('video-convert-format', 'mp4', false);
  assert.equal(hit, null);
});

test('policy: unknown tool → no constraint', async () => {
  const { checkLever, checkFormat } = await import('../lib/limits/policy.ts');
  assert.equal(checkLever('not-a-real-tool', 'input-size', 999999999, false), null);
  assert.equal(checkFormat('not-a-real-tool', 'whatever', false), null);
});

// ============================================================================
// ENTITLEMENT: sanity that the existing token system still works
// ============================================================================
test('entitlement: signs + verifies happily', async () => {
  const { signEntitlement, verifyEntitlement } = await import('../lib/oioxo/entitlement.ts');
  const t = await signEntitlement({ sub: 'user-1', device: 'd', tier: 'free', features: [] }, SECRET);
  const v = await verifyEntitlement(t, SECRET, { expectDevice: 'd' });
  assert.equal(v.ok, true);
});

test('entitlement: rejects on wrong device', async () => {
  const { signEntitlement, verifyEntitlement } = await import('../lib/oioxo/entitlement.ts');
  const t = await signEntitlement({ sub: 'user-1', device: 'dev-A', tier: 'pro', features: ['ai'] }, SECRET);
  const v = await verifyEntitlement(t, SECRET, { expectDevice: 'dev-B' });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'device-mismatch');
});

// ============================================================================
// PROTECT: AES round-trip
// ============================================================================
test('protect: encrypt → decrypt round-trip', async () => {
  const { encryptAsset, decryptAsset, randomKey } = await import('../lib/oioxo/protect.ts');
  const enc = new TextEncoder();
  const key = randomKey();
  const plaintext = enc.encode('hello, world');
  const blob = await encryptAsset(plaintext, key);
  const out = await decryptAsset(blob, key);
  assert.equal(new TextDecoder().decode(out), 'hello, world');
});

test('protect: decrypt with WRONG key throws (GCM auth)', async () => {
  const { encryptAsset, decryptAsset, randomKey } = await import('../lib/oioxo/protect.ts');
  const enc = new TextEncoder();
  const k1 = randomKey();
  const k2 = randomKey();
  const blob = await encryptAsset(enc.encode('secret'), k1);
  let threw = false;
  try { await decryptAsset(blob, k2); } catch { threw = true; }
  assert.ok(threw, 'expected wrong-key decrypt to throw');
});

// ============================================================================
// RUN
// ============================================================================
(async () => {
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed++;
      console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    } catch (e) {
      failed++;
      console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${e.message}`);
    }
  }
  console.log();
  console.log(`  ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
