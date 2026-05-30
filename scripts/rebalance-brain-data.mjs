// Rebalance the brain training set to fix the v3 runaway-new-goal prior.
//
// Diagnosis (confusion matrix): turn-role 67.6% because the model defaults to
// new-goal — and the cause is the TRAINING DATA being 54% new-goal (1233/2297),
// with the other roles starved (outcome 2.5%, correction 4%, chitchat 3.6%).
// Fix: downsample new-goal + upsample the starved roles → a balanced distribution.
// Zero Gemini cost. Reads/writes lib/ai/eval/out/ (the data moat, gitignored).
//
// Run: node scripts/rebalance-brain-data.mjs
import fs from 'fs';
const SRC = 'lib/ai/eval/out/brain-train.jsonl';
const OUT = 'lib/ai/eval/out/brain-train-balanced.jsonl';
const rows = fs.readFileSync(SRC, 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const by = {}; for (const r of rows) { const t = r.label?.turnRole || '?'; (by[t] ??= []).push(r); }
const sh = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
// [keepCount, dupFactor] per role — cap new-goal, oversample the starved roles.
const plan = { 'new-goal': [400, 1], 'question': [280, 1], 'parameter': [266, 1], 'append-step': [155, 1],
               'confirmation': [131, 1], 'correction': [93, 2], 'chitchat': [82, 2], 'outcome': [57, 3] };
let out = [];
for (const [role, [keep, dup]] of Object.entries(plan)) {
  const take = sh((by[role] || []).slice()).slice(0, keep);
  for (let d = 0; d < dup; d++) out.push(...take);
}
out = sh(out);
fs.writeFileSync(OUT, out.map((r) => JSON.stringify(r)).join('\n') + '\n');
const t2 = {}; for (const r of out) { const t = r.label.turnRole; t2[t] = (t2[t] || 0) + 1; }
console.log('balanced rows:', out.length, '\ndistribution:', JSON.stringify(t2));
