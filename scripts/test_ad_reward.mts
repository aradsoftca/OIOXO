// Rewarded-ad unlock (lib/usage/ad-reward.ts): ticket signing + AdMob SSV signature check.
// Run: npx tsx scripts/test_ad_reward.mts
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.AD_TICKET_SECRET = 'test-secret';
const { signTicket, verifyTicket, verifyAdMobCallback } = await import('../lib/usage/ad-reward.ts');

let pass = 0;
const ok = (name: string) => { pass++; console.log('ok  ', name); };

// --- tickets
const t = signTicket(['fp-a', 'fp-b'], 'image');
assert.deepEqual(verifyTicket(t)?.fps, ['fp-a', 'fp-b']); ok('ticket round-trips');
assert.equal(verifyTicket(t)?.category, 'image'); ok('ticket keeps category');
const [body, mac] = t.split('.');
const forged = Buffer.from(JSON.stringify({ fps: ['someone-else'], category: 'image', exp: Date.now() + 1e6 })).toString('base64url');
assert.equal(verifyTicket(`${forged}.${mac}`), null); ok('forged body rejected');
assert.equal(verifyTicket(`${body}.x${mac.slice(1)}`), null); ok('bad mac rejected');
assert.equal(verifyTicket(t, Date.now() + 2 * 60 * 60 * 1000), null); ok('expired ticket rejected');
assert.equal(verifyTicket('garbage'), null); ok('garbage rejected');

// --- AdMob SSV: sign like Google does, with our own key served as the verifier list
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
globalThis.fetch = (async () => new Response(JSON.stringify({ keys: [{ keyId: 42, pem }] }))) as typeof fetch;
const msg = `ad_network=5450213213286189855&ad_unit=123&custom_data=${encodeURIComponent(t)}&reward_amount=3&reward_item=uses&timestamp=1700000000000&transaction_id=abc`;
const sig = crypto.sign('sha256', Buffer.from(msg), privateKey).toString('base64url');
const good = await verifyAdMobCallback(`?${msg}&signature=${sig}&key_id=42`);
assert.equal(good?.get('custom_data'), t); ok('genuine callback verified, custom_data intact');
const tampered = msg.replace('reward_amount=3', 'reward_amount=300');
assert.equal(await verifyAdMobCallback(`?${tampered}&signature=${sig}&key_id=42`), null); ok('tampered callback rejected');
assert.equal(await verifyAdMobCallback(`?${msg}&signature=${sig}&key_id=7`), null); ok('unknown key rejected');
assert.equal(await verifyAdMobCallback(`?${msg}`), null); ok('unsigned callback rejected');

console.log(`${pass} passed`);
