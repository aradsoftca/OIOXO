/**
 * REAL from-scratch BUILD test, headless — the case that failed live ("asked a
 * Pac-Man game, got a circle"). Starts with an EMPTY project and drives the real
 * loop with the real on-device 0.5B coder. The oracle is BEHAVIORAL, not a
 * typecheck: it loads the generated page in a DOM, clicks the UI, and asserts it
 * actually works — the same "the device proves it" idea as the live iframe probe,
 * but headless via happy-dom so it runs in CI / from the terminal.
 *
 * Run: npx tsx scripts/test_build_live.mjs
 */
import { runCodeLoop } from '../lib/oioxo/codeloop.ts';
import { buildPrompt, parseEdits, singleTarget, SYSTEM } from '../lib/oioxo/codegen.ts';
import { Window } from 'happy-dom';

const MODEL = process.env.CODER_MODEL || 'onnx-community/Qwen2.5-Coder-0.5B-Instruct';

// Representative of how the product builds: a recipe SCAFFOLDS the file, then the
// loop fills it. One index.html with an inline <script> → the proven single-target
// path (the model writes the real code into the one file it's given, guided by the
// behavioral error feedback). This is the "build a working thing" path, headless.
const TASK =
  'Build a counter inside index.html. Add a button with id "inc" and an element ' +
  'with id "count" that starts at 0 and increases by 1 each time the button is ' +
  'clicked. Use an inline <script> tag for the JavaScript.';
// Clean scaffold — no "TODO" comment, which a tiny model just reprints verbatim.
const FILES = [
  { path: 'index.html', content: '<!doctype html>\n<html>\n<head><meta charset="utf-8"><title>Counter</title></head>\n<body>\n</body>\n</html>\n' },
];

/** Behavioral oracle: render the generated app in a DOM, click #inc, assert the
 *  count goes 0 → 1. Returns the same {ok, output, errors} shape the loop feeds
 *  back to the model — so a wrong build produces a concrete, fixable error. */
const run = async (files) => {
  const html = files.find((f) => /\.html$/i.test(f.path));
  if (!html) return { ok: false, output: '', errors: 'No HTML file was created. Create index.html.' };

  // Inline any <script src="x.js"> with the generated file so the DOM runs it.
  const src = html.content.replace(
    /<script[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi,
    (m, p) => {
      const want = p.replace(/^\.?\//, '');
      const dep = files.find((f) => f.path === want || f.path.endsWith('/' + want));
      return dep ? `<script>\n${dep.content}\n</script>` : m;
    },
  );

  const errors = [];
  const window = new Window({ settings: { disableJavaScriptEvaluation: false, disableJavaScriptFileLoading: true } });
  const doc = window.document;
  window.addEventListener('error', (e) => errors.push('Runtime error: ' + (e.message || e.error || e)));
  try {
    // happy-dom doesn't auto-run parsed scripts, so we build the DOM from the
    // markup, then execute the page's inline scripts in order via window.eval
    // (the verified-working path) — then fire DOM-ready so either handler style
    // (direct, or wrapped in DOMContentLoaded) attaches.
    const scripts = [];
    const markup = src.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, code) => {
      if (!/\bsrc=/i.test(attrs)) scripts.push(code);
      return '';
    });
    doc.write(markup);
    doc.close?.();
    for (const code of scripts) {
      try { window.eval(code); } catch (e) { errors.push('Script error: ' + (e?.message || e)); }
    }
    try { doc.dispatchEvent(new window.Event('DOMContentLoaded')); window.dispatchEvent(new window.Event('load')); } catch { /* */ }
    await new Promise((r) => setTimeout(r, 40)); // let listeners settle

    const inc = doc.getElementById('inc');
    const count = doc.getElementById('count');
    if (!inc) errors.push("No element with id 'inc' (the button to click).");
    if (!count) errors.push("No element with id 'count' (the number display).");
    if (inc && count) {
      const before = (count.textContent || '').trim();
      if (!/0/.test(before)) errors.push(`#count should start at 0 but shows "${before}".`);
      inc.click();
      await new Promise((r) => setTimeout(r, 30));
      const after = (count.textContent || '').trim();
      if (after === before) errors.push(`Clicking #inc did not change #count (still "${after}"). The click handler is missing or wrong.`);
      else if (!/\b1\b/.test(after)) errors.push(`After one click #count should show 1 but shows "${after}".`);
    }
  } catch (e) {
    errors.push('Threw while running: ' + (e?.message || e));
  } finally {
    try { await window.happyDOM?.close?.(); } catch { /* */ }
  }
  const errText = errors.join('\n');
  return { ok: errors.length === 0, output: errText || 'all checks passed', errors: errText };
};

console.log(`loading model ${MODEL}…`);
const t0 = Date.now();
const { pipeline } = await import('@huggingface/transformers');
const pipe = await pipeline('text-generation', MODEL, { dtype: 'q4' });
console.log(`model ready in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

const generate = async (ctx) => {
  const user = buildPrompt(ctx);
  // Sample on EVERY attempt so best-of-N candidates actually differ (a greedy
  // repair just reprints the source). This is the loop's weak-model lever.
  const out = await pipe(
    [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
    { max_new_tokens: 700, do_sample: true, temperature: ctx.attempt === 0 ? 0.5 : 0.45, top_p: 0.92, return_full_text: false },
  );
  const reply = Array.isArray(out) ? (out[0]?.generated_text ?? '') : '';
  const text = typeof reply === 'string' ? reply : (reply.at?.(-1)?.content ?? '');
  console.log(`\n--- attempt ${ctx.attempt} reply (${text.length} chars) ---\n${text.slice(0, 700)}\n---`);
  const edits = parseEdits(text, ctx.files, singleTarget(ctx.files));
  console.log(`parsed ${edits.length} edit(s): ${edits.map((e) => e.path).join(', ') || '(none)'}`);
  return edits;
};

const res = await runCodeLoop({
  task: TASK, files: FILES, testCmd: 'dom-check', maxIters: 4, candidates: 3,
  generate, run,
  onStep: (s) => console.log(`step ${s.attempt}: ${s.ok ? 'PASS' : 'fail'}${s.errors ? ' — ' + s.errors.split('\n')[0] : ''}`),
});

console.log('\n================ RESULT ================');
console.log(`ok=${res.ok}  iters=${res.iters}`);
for (const f of res.files) console.log(`\n----- ${f.path} -----\n${f.content}`);
console.log(res.ok
  ? '\n✅ from-scratch counter that ACTUALLY works (click → 0→1) with the real 0.5B coder.'
  : '\n❌ did not reach a working counter in 6 tries.');
process.exit(res.ok ? 0 : 1);
