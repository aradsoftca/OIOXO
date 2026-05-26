/**
 * oioxo Agentic IDE — consolidated regression suite for the PURE cores (the
 * logic that doesn't need a browser/WebGPU/WebRTC). Run: `npm run test:oioxo`.
 * Anything needing a real device is in scripts/QA_CHECKLIST.md instead.
 */
import assert from 'node:assert';

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ---------- tempfs ----------
test('tempfs: flat files → nested WebContainer tree', async () => {
  const { treeFromFiles } = await import('../lib/oioxo/tempfs.ts');
  const t = treeFromFiles([
    { path: 'index.html', content: '<h1>hi</h1>' },
    { path: 'src/app.js', content: 'x' },
    { path: 'src/lib/u.js', content: 'y' },
  ]);
  assert.equal(t['index.html'].file.contents, '<h1>hi</h1>');
  assert.equal(t['src'].directory['app.js'].file.contents, 'x');
  assert.equal(t['src'].directory['lib'].directory['u.js'].file.contents, 'y');
});

// ---------- scaffold ----------
test('scaffold: template routing + coherent + valid package.json', async () => {
  const { scaffold, pickTemplate, templateLabel } = await import('../lib/oioxo/scaffold.ts');
  assert.equal(pickTemplate('a react component with hooks'), 'react');
  assert.equal(pickTemplate('snake game on canvas'), 'game');
  assert.equal(pickTemplate('a REST api for todos'), 'api');
  assert.equal(pickTemplate('python script with pandas'), 'python');
  assert.equal(pickTemplate('a sqlite database schema'), 'sql');
  assert.equal(pickTemplate('cli that renames files'), 'node');
  assert.equal(pickTemplate('a landing page'), 'web');
  for (const goal of ['react app', 'snake game', 'todo api', 'rename cli', 'site', 'py tool', 'inventory db']) {
    const s = scaffold(goal);
    assert.ok(s.files.length >= 2 && s.runCmd, goal);
    const pkg = s.files.find((f) => f.path === 'package.json');
    if (pkg) JSON.parse(pkg.content); // must be valid JSON
    assert.ok(templateLabel(s.template).length > 0);
    if (s.template === 'react') assert.equal(s.setup, 'npm install');
    if (s.template === 'web' || s.template === 'game') assert.equal(s.staticServe, true);
    if (s.template === 'python') assert.equal(s.runtime, 'python');
    if (s.template === 'sql') assert.equal(s.runtime, 'sql');
  }
});

// ---------- codegen parseEdits (robust for weak models) ----------
test('codegen: parseEdits captures path-fences, language-fences, and unfenced code', async () => {
  const { parseEdits } = await import('../lib/oioxo/codegen.ts');
  const proj = [{ path: 'index.html' }, { path: 'game.js' }];
  // path fence (explicit)
  assert.deepEqual(parseEdits('```game.js\nconst x=1\n```', proj).map((e) => e.path), ['game.js']);
  // LANGUAGE fence → mapped to the project's .js file (the key fix)
  const j = parseEdits('Here you go:\n```javascript\nconst y=2\n```', proj);
  assert.equal(j.length, 1); assert.equal(j[0].path, 'game.js'); assert.ok(j[0].content.includes('const y=2'));
  // html language fence → index.html
  assert.equal(parseEdits('```html\n<canvas></canvas>\n```', proj)[0].path, 'index.html');
  // language fence with no matching file → conventional default
  assert.equal(parseEdits('```css\nbody{}\n```', [])[0].path, 'style.css');
  // unfenced whole-file reply → mapped by content
  const u = parseEdits('<!doctype html><html><body><canvas></canvas></body></html>', proj);
  assert.equal(u.length, 1); assert.equal(u[0].path, 'index.html');
  // pure prose → nothing
  assert.equal(parseEdits('I think you should add a canvas and a loop.', proj).length, 0);
  // REGRESSION (found by live 0.5B-coder): a single-target REPAIR answered in prose
  // must NOT overwrite the file with that prose. No fence + not code-shaped → no edit.
  const prose = parseEdits('SEARCH/REPLACE: Replace `ms` with `1000` in the debounce function definition.', proj, 'game.js');
  assert.equal(prose.length, 0, 'prose repair reply must not become the file');
  // but a real fenced code reply in single-target mode is still accepted
  const real = parseEdits('```\nconst x = 1;\n```', proj, 'game.js');
  assert.equal(real.length, 1); assert.equal(real[0].path, 'game.js'); assert.ok(real[0].content.includes('const x = 1;'));
  // unfenced but clearly code (has braces/arrow) → accepted in single-target mode
  assert.equal(parseEdits('export const f = () => { return 2; };', proj, 'game.js').length, 1);
  // REGRESSION (live "i see nothing"): a messy fence info line "typescript // index.html"
  // must map to index.html with the fence STRIPPED — never leak "```typescript" into the file.
  const messy = parseEdits('```typescript // index.html\n<!doctype html><html><body><canvas></canvas></body></html>\n```', proj);
  assert.equal(messy.length, 1); assert.equal(messy[0].path, 'index.html');
  assert.ok(!messy[0].content.includes('```') && !/typescript \/\/ index\.html/.test(messy[0].content), 'fence + label stripped');
  assert.ok(messy[0].content.includes('<canvas>'));
  // an INCOMPLETE fence (cut-off stream, no closing ```) must still strip the leading fence
  const cut = parseEdits('```html\n<!doctype html><html><body><h1>hi</h1></body></html>', [{ path: 'index.html' }]);
  assert.ok(cut.length === 1 && !cut[0].content.startsWith('```') && cut[0].content.includes('<h1>'));
  // single-target: a fenced reply with a stray leading fence → content has no backticks
  const st = parseEdits('```html\n<div>x</div>\n```', proj, 'index.html');
  assert.ok(!st[0].content.includes('```') && st[0].content.includes('<div>x</div>'));
});

// ---------- patch (diff-not-rewrite, the weak-device magic) ----------
test('patch: parsePatches reads single + multi-file search/replace blocks', async () => {
  const { parsePatches } = await import('../lib/oioxo/patch.ts');
  // single, path-less → uses default
  const one = parsePatches('<<<<<<< SEARCH\nconst x = 1\n=======\nconst x = 2\n>>>>>>> REPLACE', 'a.js');
  assert.equal(one.length, 1);
  assert.equal(one[0].path, 'a.js');
  assert.equal(one[0].search.trim(), 'const x = 1');
  assert.equal(one[0].replace.trim(), 'const x = 2');
  // multi-file with *** path markers
  const multi = parsePatches(
    '*** src/a.js\n<<<<<<< SEARCH\na\n=======\nA\n>>>>>>> REPLACE\n*** src/b.js\n<<<<<<< SEARCH\nb\n=======\nB\n>>>>>>> REPLACE',
  );
  assert.deepEqual(multi.map((h) => h.path), ['src/a.js', 'src/b.js']);
  // tolerant marker lengths / casing + prose around it
  assert.equal(parsePatches('sure:\n<<<< search\nfoo\n====\nbar\n>>>> replace\nok').length, 1);
});

test('patch: applyHunks tolerance ladder (exact, indentation drift, blank drift, refusal)', async () => {
  const { applyHunks } = await import('../lib/oioxo/patch.ts');
  const file = 'function f() {\n    return 1;\n}\n';
  // exact
  assert.ok(applyHunks(file, [{ search: '    return 1;', replace: '    return 2;' }]).content.includes('return 2;'));
  // indentation drift in SEARCH (model wrote no indent) still matches via per-line trim
  const drift = applyHunks(file, [{ search: 'return 1;', replace: '    return 42;' }]);
  assert.equal(drift.applied, 1); assert.ok(drift.content.includes('return 42;'));
  // blank-line drift inside the block (loose match)
  const blanks = applyHunks('a\nb\nc\n', [{ search: 'a\n\nb\n\nc', replace: 'X\nY\nZ' }]);
  assert.equal(blanks.applied, 1); assert.ok(blanks.content.startsWith('X\nY\nZ'));
  // a search that isn't there → REFUSED, file untouched (never corrupt on a guess)
  const miss = applyHunks(file, [{ search: 'return 999;', replace: 'boom' }]);
  assert.equal(miss.failed, 1); assert.equal(miss.content, file);
  // empty SEARCH = whole/new file
  assert.equal(applyHunks('old', [{ search: '', replace: 'brand new' }]).content, 'brand new');
});

test('patch: applyPatchReply → full-file edits, only for changed files', async () => {
  const { applyPatchReply, estimateTokens } = await import('../lib/oioxo/patch.ts');
  const files = [
    { path: 'a.js', content: 'const n = "5";\nexport default n;\n' },
    { path: 'b.js', content: 'export const ok = true;\n' },
  ];
  const reply = '*** a.js\n<<<<<<< SEARCH\nconst n = "5";\n=======\nconst n = 5;\n>>>>>>> REPLACE';
  const r = applyPatchReply(reply, files);
  assert.equal(r.applied, 1); assert.equal(r.failed, 0);
  assert.deepEqual(r.edits.map((e) => e.path), ['a.js']); // b.js unchanged → not emitted
  assert.ok(r.edits[0].content.includes('const n = 5;'));
  // the whole point: the model's reply is far cheaper than reprinting the file
  assert.ok(estimateTokens(reply) > 0);
  // no recognizable patch → empty (caller falls back to whole-file)
  assert.equal(applyPatchReply('just some prose, no edits', files).edits.length, 0);
});

// ---------- bricks (verified-brick corpus, the weak-device magic) ----------
test('bricks: every seed brick passes the type oracle (verified by construction)', async () => {
  const { buildBrickSeed, SEED_BRICKS } = await import('../lib/oioxo/bricks.ts');
  const r = await buildBrickSeed();
  assert.equal(r.rejected.length, 0, 'rejected: ' + JSON.stringify(r.rejected));
  assert.equal(r.bricks.length, SEED_BRICKS.length);
  assert.ok(SEED_BRICKS.every((b) => b.verified && b.code.trim().length > 0));
});

test('bricks: matchBricks retrieves the right unit + no false positive on off-topic', async () => {
  const { matchBricks } = await import('../lib/oioxo/bricks.ts');
  const top = (q) => { const h = matchBricks(q); return h[0] ? h[0].kind + ':' + h[0].title.split(' —')[0] : null; };
  assert.ok(/debounce/i.test(top('add a debounce helper for the search box') || ''));
  assert.ok(/stack/i.test(top('I need a typed stack data structure') || ''));
  assert.ok(/intersects/i.test(top('detect collision between two rectangles') || ''));
  assert.ok(/fetchJson/i.test(top('fetch json from an api') || ''));
  assert.equal(matchBricks('write a poem about the sea').length, 0); // unrelated → no noise
  assert.equal(matchBricks('').length, 0);
});

test('bricks: harvest a green build into a tagged, verified brick (+ dedupe id)', async () => {
  const { brickFromVerifiedBuild, harvestTags, brickId } = await import('../lib/oioxo/bricks.ts');
  const files = [
    { path: 'README.md', content: '# docs' },
    { path: 'src/slugify.ts', content: 'export const slugify = (s: string) => s.toLowerCase().replace(/\\s+/g, "-");\n' },
    { path: 'src/slugify.test.ts', content: 'test("x", () => {});' },
  ];
  const b = brickFromVerifiedBuild('build a slugify utility for blog titles', files);
  assert.equal(b.lang, 'ts'); assert.equal(b.origin, 'trajectory'); assert.equal(b.verified, true);
  assert.ok(b.code.includes('slugify')); // picked the source, not the README or test
  assert.ok(b.tags.includes('slugify') && b.tags.includes('blog')); // goal + filename, no stopwords
  assert.ok(!b.tags.includes('for') && !b.tags.includes('build'));
  assert.equal(brickId(b.code, b.kind), b.id); // stable content-hash id (dedupe)
  // no usable code file → null
  assert.equal(brickFromVerifiedBuild('docs only', [{ path: 'a.md', content: '# x' }]), null);
});

test('bricks: renderBricksForPrompt yields a compact reuse block', async () => {
  const { matchBricks, renderBricksForPrompt } = await import('../lib/oioxo/bricks.ts');
  const txt = renderBricksForPrompt(matchBricks('debounce the input'));
  assert.ok(/reuse or adapt/i.test(txt));
  assert.ok(/```ts/.test(txt) && /debounce/.test(txt));
  assert.equal(renderBricksForPrompt([]), '');
});

// ---------- brick sharing (P2P corpus pooling, trust-nothing gate) ----------
test('brick-share: brickMessages + BrickShareReceiver round-trip', async () => {
  const { brickMessages, BrickShareReceiver } = await import('../lib/oioxo/brick-share.ts');
  const { SEED_BRICKS } = await import('../lib/oioxo/bricks.ts');
  const sample = SEED_BRICKS.slice(0, 3);
  const rx = new BrickShareReceiver();
  let got = null;
  for (const m of brickMessages(sample)) { const r = rx.accept(m); if (r) got = r; }
  assert.equal(got.length, 3);
  assert.deepEqual(got.map((b) => b.title), sample.map((b) => b.title));
  assert.deepEqual(rx.progress(), { received: 3, total: 3 });
});

test('brick-share: revalidateForImport TRUSTS NOTHING — re-proves locally', async () => {
  const { revalidateForImport } = await import('../lib/oioxo/bricks.ts');
  const incoming = [
    // honest, type-correct → accepted (and re-proven, not trusted on its flag)
    { id: 'spoofed', title: 'add two', kind: 'util', tags: ['add'], lang: 'ts', origin: 'seed', verified: true,
      code: 'export const add = (a: number, b: number): number => a + b;\n' },
    // a LYING brick: claims verified but has a type error → our oracle rejects it
    { id: 'evil', title: 'malware', kind: 'util', tags: ['x'], lang: 'ts', origin: 'seed', verified: true,
      code: 'export const n: number = "not a number";\n' },
    // a lang we cannot prove in Node → rejected rather than trusted
    { id: 'h', title: 'page', kind: 'dom', tags: ['html'], lang: 'html', origin: 'seed', verified: true,
      code: '<script>fetch("//evil")</script>' },
  ];
  const r = await revalidateForImport(incoming);
  assert.equal(r.accepted.length, 1);
  assert.equal(r.accepted[0].title, 'add two');
  assert.equal(r.accepted[0].origin, 'user');          // never inherits 'seed'
  assert.notEqual(r.accepted[0].id, 'spoofed');         // id re-derived from content
  assert.equal(r.accepted[0].verified, true);           // because WE proved it
  assert.equal(r.rejected.length, 2);
  assert.ok(r.rejected.some((x) => /oracle rejected/.test(x.reason)));   // the liar
  assert.ok(r.rejected.some((x) => /can't prove html/.test(x.reason)));  // unverifiable lang
});

// ---------- checks (checks-before-code, dense oracle for any goal) ----------
test('checks: deriveChecks reads features from any goal + always a content baseline', async () => {
  const { deriveChecks } = await import('../lib/oioxo/checks.ts');
  const names = (g) => deriveChecks(g).map((c) => c.name);
  // a goal with NO recipe still gets behavioral checks (the gap lever 3 closes)
  const counter = names('a button that increases a counter when clicked');
  assert.ok(counter.some((n) => /content/i.test(n)), 'baseline content check always present');
  assert.ok(counter.some((n) => /button/i.test(n)));
  assert.ok(counter.some((n) => /click/i.test(n)));
  assert.ok(counter.some((n) => /number/i.test(n)));
  // feature words map to their checks
  assert.ok(names('a photo gallery').some((n) => /image/i.test(n)));
  assert.ok(names('a contact form').some((n) => /form fields/i.test(n)));
  assert.ok(names('move the player with arrow keys').some((n) => /keyboard/i.test(n)));
  // contentless prose → just the baseline (no false feature checks)
  const bare = deriveChecks('something nice');
  assert.equal(bare.length, 1);
  assert.ok(/content/i.test(bare[0].name));
});

test('checks: recipe checks win + dedupe + capped (stays satisfiable)', async () => {
  const { deriveChecks, mergeChecks } = await import('../lib/oioxo/checks.ts');
  const { recipeFor } = await import('../lib/oioxo/recipes.ts');
  const pac = deriveChecks('build a pacman game');
  assert.ok(pac.length <= 6, 'capped so a weak model can satisfy it');
  // authored recipe canvas checks are present (and not duplicated by derived ones)
  const recNames = (recipeFor('pacman game').checks || []).map((c) => c.name);
  assert.ok(recNames.every((rn) => pac.some((c) => c.name === rn)));
  const srcs = pac.map((c) => c.src);
  assert.equal(new Set(srcs).size, srcs.length, 'no duplicate src');
  // mergeChecks dedupes by name and by src
  const a = { name: 'X', src: 's1' }, b = { name: 'x', src: 's2' }, c = { name: 'Y', src: 's1' };
  assert.equal(mergeChecks([a], [b], [c]).length, 1);
});

// ---------- publish / show a finished site (roadmap #4) ----------
test('publish: inlineSite folds a static site into one self-contained HTML', async () => {
  const { inlineSite, preparePublish, publishTargets } = await import('../lib/oioxo/publish.ts');
  const files = [
    { path: 'index.html', content: '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><h1>Hi</h1><script src="./app.js"></script></body></html>' },
    { path: 'style.css', content: 'h1{color:red}' },
    { path: 'app.js', content: 'console.log("hi")' },
    { path: 'README.md', content: 'docs' },
  ];
  const html = inlineSite(files);
  assert.ok(html.includes('<style>') && html.includes('h1{color:red}'), 'css inlined');
  assert.ok(html.includes('console.log("hi")'), 'js inlined');
  assert.ok(!/href="[^"]*style\.css"/.test(html) && !/src="[^"]*app\.js"/.test(html), 'no local link/src left');
  // remote refs are left untouched
  const remote = inlineSite([{ path: 'index.html', content: '<link rel="stylesheet" href="https://cdn/x.css"><body></body>' }]);
  assert.ok(remote.includes('https://cdn/x.css'));
  // preparePublish: static site → one html bundle; node project → file tree + gh-pages adds .nojekyll
  assert.ok(preparePublish(files, 'bundle').html.includes('<style>'));
  const gh = preparePublish(files, 'github-pages');
  assert.equal(gh.branch, 'gh-pages');
  assert.ok(gh.files.some((f) => f.path === '.nojekyll'));
  const node = preparePublish([{ path: 'package.json', content: '{}' }, { path: 'server.js', content: '' }], 'bundle');
  assert.ok(node.files && !node.html, 'a node project ships as files, not one html');
  assert.ok(publishTargets().length === 3);
});

// ---------- quality gates (roadmap #5) ----------
test('checks: quality gates are opt-in, sound (vacuous), and extend beyond the cap', async () => {
  const { deriveChecks, qualityChecks } = await import('../lib/oioxo/checks.ts');
  const plain = deriveChecks('a photo gallery');
  const withQ = deriveChecks('a photo gallery', { quality: true });
  // quality adds checks on top of feature checks (beyond the 6 cap)
  assert.ok(withQ.length > plain.length);
  assert.ok(withQ.some((c) => /alt text/i.test(c.name)));
  // default stays unchanged (back-compat: numeric cap still works)
  assert.ok(deriveChecks('a photo gallery', 6).length <= 6);
  // soundness pattern: each quality check is vacuously true when its element is absent
  for (const c of qualityChecks()) {
    assert.ok(/\.every\b|__oioxo/.test(c.src), `quality check "${c.name}" should be vacuous-sound`);
  }
});

// ---------- model escalation policy (roadmap #3) ----------
test('escalate: chooseCoder sizes the model to hardware + difficulty + resources', async () => {
  const { chooseCoder, shouldOffloadOracle } = await import('../lib/oioxo/escalate.ts');
  // baseline by hardware
  assert.equal(chooseCoder({ hardware: 'none' }).tier, 'wasm');
  assert.equal(chooseCoder({ hardware: 'low' }).tier, 'wasm');
  assert.equal(chooseCoder({ hardware: 'mid' }).tier, 'webgpu-small');
  assert.equal(chooseCoder({ hardware: 'high' }).tier, 'webgpu-small');
  // stuck → escalate to the strongest AVAILABLE tier (frontier > local-big > peer)
  assert.equal(chooseCoder({ hardware: 'mid', stuck: 2, hasFrontierKey: true, hasLocalBig: true }).tier, 'frontier');
  assert.equal(chooseCoder({ hardware: 'mid', stuck: 2, hasLocalBig: true }).tier, 'local-big');
  assert.equal(chooseCoder({ hardware: 'low', stuck: 3, hasPeer: true }).tier, 'distributed');
  // stuck but nothing stronger → stay on-device (loop searches wider)
  assert.equal(chooseCoder({ hardware: 'low', stuck: 3 }).tier, 'wasm');
  // large project on capable hw with a bigger local model → use it
  assert.equal(chooseCoder({ hardware: 'high', large: true, hasLocalBig: true }).tier, 'local-big');
  // offload heavy verify to a peer when the device is weak
  assert.equal(shouldOffloadOracle({ hardware: 'low', hasPeer: true }), true);
  assert.equal(shouldOffloadOracle({ hardware: 'high', hasPeer: true }), false);
});

// ---------- long-horizon project planner (roadmap #2) ----------
test('plan-project: dependency-ordered multi-step plan from the capability graph', async () => {
  const { planProject, isLargeProject } = await import('../lib/oioxo/plan-project.ts');
  // todo matches a RECIPE → authored decomposed steps shape the plan
  const p = planProject('a todo list app that saves my items');
  const titles = p.steps.map((s) => s.title);
  assert.ok(/scaffold/i.test(titles[0]), 'scaffolds first');
  assert.ok(/wire|verify/i.test(titles[titles.length - 1]), 'verifies last');
  assert.equal(p.recipeKind, 'list-app');
  assert.ok(p.steps.length >= 4, 'a real multi-step plan, not one blob');
  // a goal with NO recipe → composed from the capability graph (deps ordered)
  const comp = planProject('a counter with a theme toggle button');
  assert.equal(comp.recipeKind, undefined);
  assert.ok(comp.steps.some((s) => /counter/i.test(s.title)), 'composed a counter brick step');
  assert.ok(comp.steps.some((s) => /theme/i.test(s.title)), 'composed a theme brick step');
  // a known recipe shapes the plan (game → canvas-game steps)
  const game = planProject('a snake game on canvas');
  assert.equal(game.recipeKind, 'canvas-game');
  assert.ok(game.steps.length >= 4);
  // large-project detector
  assert.equal(isLargeProject('a todo app that saves'), true);
  assert.equal(isLargeProject('reverse a string'), false);
});

// ---------- on-device learning: federated LoRA merge (Gem 4) ----------
test('lora: federated mergeDeltas (FedAvg weighted by samples) + job assembly', async () => {
  const { mergeDeltas, scaleDelta, buildLoraJob, StubTrainer } = await import('../lib/oioxo/lora.ts');
  // device A learned from 1 example, device B from 3 → B pulls 3x harder
  const A = { base: 'qwen-coder', samples: 1, tensors: { w: [2, 4] } };
  const B = { base: 'qwen-coder', samples: 3, tensors: { w: [4, 8] } };
  const m = mergeDeltas([A, B]);
  assert.deepEqual(m.tensors.w, [(2 * 1 + 4 * 3) / 4, (4 * 1 + 8 * 3) / 4]); // [3.5, 7]
  assert.equal(m.samples, 4);
  // never merge across different base models
  const x = mergeDeltas([A, { base: 'other', samples: 9, tensors: { w: [99, 99] } }]);
  assert.deepEqual(x.tensors.w, [2, 4]); // only A's base contributes
  // shape mismatch for a tensor is skipped, not averaged into garbage
  const y = mergeDeltas([{ base: 'b', samples: 1, tensors: { w: [1, 2] } }, { base: 'b', samples: 1, tensors: { w: [1, 2, 3] } }]);
  assert.deepEqual(y.tensors.w, [1, 2]);
  // scaleDelta (trust a fresh federated delta less)
  assert.deepEqual(scaleDelta(A, 0.5).tensors.w, [1, 2]);
  // job assembly from oracle-labeled examples
  const job = buildLoraJob([{ role: 'fix', messages: [{ role: 'user', content: 'u' }, { role: 'assistant', content: 'a' }] }], { base: 'qwen-coder' });
  assert.equal(job.base, 'qwen-coder'); assert.equal(job.examples.length, 1); assert.ok(job.rank > 0);
  // stub trainer is honest (no-op delta) and conforms to the interface
  assert.equal((await StubTrainer.train(job)).samples, 0);
});

// ---------- record-replay debugging (Gem 7) ----------
test('debug-trace: faultWindow isolates the steps + last state before a failure', async () => {
  const { faultWindow, formatFault, seedScript } = await import('../lib/oioxo/debug-trace.ts');
  const trace = [
    { seq: 0, kind: 'event', label: 'keydown' },
    { seq: 1, kind: 'state', label: 'player', data: { x: 10, y: 5 } },
    { seq: 2, kind: 'event', label: 'keydown' },
    { seq: 3, kind: 'state', label: 'player', data: { x: NaN, y: 5 } },
    { seq: 4, kind: 'log', label: 'moving' },
    { seq: 5, kind: 'error', label: 'TypeError: cannot read x of undefined', data: 'game.js:42' },
  ];
  const fw = faultWindow(trace, 4);
  assert.equal(fw.fault.seq, 5);
  // the last state BEFORE the error is the corrupted one (x: NaN) — the real clue
  assert.deepEqual(fw.lastState.data, { x: NaN, y: 5 });
  assert.ok(fw.window.length <= 5 && fw.window[fw.window.length - 1].kind === 'error');
  const text = formatFault(fw);
  assert.ok(/Last known state/.test(text) && /Failure:/.test(text) && /cannot read x/.test(text));
  // no error in the trace → tail context, no throw
  assert.equal(faultWindow(trace.slice(0, 3)).fault, undefined);
  // seed snippet is deterministic JS (smoke)
  assert.ok(seedScript(7).includes('Math.random'));
});

// ---------- project history (never lose work, time-travel green) ----------
test('history: dedupe + keep milestones + prune old edits + lastGreen', async () => {
  const { makeSnapshot, addToHistory, lastGreen, changedPaths, sameFiles } = await import('../lib/oioxo/history.ts');
  const f = (c) => [{ path: 'a.js', content: c }];
  let h = [];
  h = addToHistory(h, makeSnapshot('scaffold', 'start', f('v0')));
  h = addToHistory(h, makeSnapshot('edit', 'e1', f('v1')));
  // identical files → no new row (dedupe), but a green milestone upgrades the reason
  const before = h.length;
  h = addToHistory(h, makeSnapshot('green', 'works', f('v1')));
  assert.equal(h.length, before, 'identical state did not add a row');
  assert.equal(h[h.length - 1].reason, 'green', 'reason upgraded edit→green on same state');
  // prune: many edits keep only the most recent N, but milestones survive
  for (let i = 0; i < 40; i++) h = addToHistory(h, makeSnapshot('edit', 'e' + i, f('x' + i)), 10);
  assert.ok(h.filter((s) => s.reason === 'edit').length <= 10, 'edits pruned to cap');
  assert.ok(h.some((s) => s.reason === 'scaffold') && h.some((s) => s.reason === 'green'), 'milestones never pruned');
  assert.equal(lastGreen(h)?.label, 'works');
  // changedPaths + sameFiles
  assert.deepEqual(changedPaths(f('a'), [{ path: 'a.js', content: 'b' }, { path: 'b.js', content: 'n' }]).sort(), ['a.js', 'b.js']);
  assert.ok(sameFiles(f('z'), f('z')) && !sameFiles(f('z'), f('y')));
});

// ---------- instant server-free preview (weak-device "see results") ----------
test('preview: route static vs server + build a self-contained srcdoc', async () => {
  const { needsServer, previewKind, buildStaticPreview } = await import('../lib/oioxo/preview.ts');
  // a plain static site → static (no WebContainer needed)
  const site = [
    { path: 'index.html', content: '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><h1>Hi</h1><script src="app.js"></script></body></html>' },
    { path: 'style.css', content: 'h1{color:teal}' },
    { path: 'app.js', content: 'document.querySelector("h1").title="hi"' },
  ];
  assert.equal(previewKind(site), 'static');
  const doc = buildStaticPreview(site);
  assert.ok(doc.includes('<style>') && doc.includes('h1{color:teal}'), 'css inlined');
  assert.ok(doc.includes('document.querySelector') && !/src="app\.js"/.test(doc), 'js inlined, no local src');
  // a Node/express project → server (WebContainer)
  const node = [
    { path: 'package.json', content: '{"scripts":{"start":"node server.js"},"dependencies":{"express":"^4"}}' },
    { path: 'server.js', content: 'const e=require("express")();e.listen(3000)' },
  ];
  assert.equal(needsServer(node), true);
  assert.equal(previewKind(node), 'server');
  // a JS-only sketch (no html) → synthesize a runnable canvas shell
  const sketch = [{ path: 'game.js', content: 'const c=document.getElementById("game");c.getContext("2d").fillRect(0,0,10,10)' }, { path: 'style.css', content: 'body{background:#111}' }];
  assert.equal(needsServer(sketch), false);
  const shell = buildStaticPreview(sketch);
  assert.ok(/<canvas/.test(shell) && shell.includes('fillRect') && shell.includes('background:#111'));
  // headInject (e.g. the runtime probe) lands in the doc
  assert.ok(buildStaticPreview(site, { headInject: '<script>window.__probe=1</script>' }).includes('window.__probe=1'));
});

// ---------- seeded verified library (cold-start corpus) ----------
test('brick-library: every seeded brick is oracle-validated (type-checks clean)', async () => {
  const { buildBrickSeed } = await import('../lib/oioxo/bricks.ts');
  const { LIBRARY_BRICKS } = await import('../lib/oioxo/brick-library.ts');
  assert.ok(LIBRARY_BRICKS.length >= 30, 'a real library, not a stub');
  const r = await buildBrickSeed(LIBRARY_BRICKS);
  assert.equal(r.rejected.length, 0, 'rejected: ' + JSON.stringify(r.rejected.slice(0, 3)));
  assert.equal(r.bricks.length, LIBRARY_BRICKS.length);
  // unique ids (no accidental dupes that would collide in the store)
  const ids = new Set(LIBRARY_BRICKS.map((b) => b.id));
  assert.equal(ids.size, LIBRARY_BRICKS.length, 'duplicate brick ids');
});

// ---------- semantic retrieval (the "any device" keystone) ----------
test('embed: cosine + semanticRank rank by MEANING (fake embedder) + cache corpus once', async () => {
  const { cosine, semanticRank } = await import('../lib/oioxo/embed.ts');
  assert.ok(cosine([1, 0, 0], [1, 0, 0]) > 0.99);
  assert.ok(Math.abs(cosine([1, 0, 0], [0, 1, 0])) < 0.01);
  // a fake embedder: deterministic vectors so we test RANKING, not the model
  const V = { 'delay typing': [1, 0, 0], 'debounce wait': [0.95, 0.1, 0], 'stack lifo': [0, 1, 0], 'fetch http': [0, 0, 1] };
  let calls = 0;
  const embed = async (texts) => { calls++; return texts.map((t) => V[t] || [0, 0, 0]); };
  const items = ['debounce wait', 'stack lifo', 'fetch http'];
  const r = await semanticRank('delay typing', items, (x) => x, embed, { k: 3, min: 0 });
  assert.equal(r[0].item, 'debounce wait', 'closest by meaning ranks first');
  assert.ok(r[0].score > r[1].score);
  // vector cache: the corpus is embedded once; a second query only embeds the query
  const cache = new Map(); calls = 0;
  await semanticRank('delay typing', items, (x) => x, embed, { vecCache: cache, min: 0 });
  const after1 = calls;
  await semanticRank('debounce wait', items, (x) => x, embed, { vecCache: cache, min: 0 });
  assert.equal(calls - after1, 1, 'corpus cached → only the new query is embedded');
});

// ---------- "any device": remote coder + device strategy ----------
test('escalate: codeSources + loopProfile route weak devices to cheap-first inference', async () => {
  const { codeSources, loopProfile } = await import('../lib/oioxo/escalate.ts');
  // no-GPU device: replay/compose FIRST (free), then borrowed inference, wasm LAST
  const weak = codeSources({ hardware: 'none', hasPeer: true, hasServer: true, hasFrontierKey: true });
  assert.deepEqual(weak.slice(0, 2), ['replay', 'compose'], 'free sources tried first');
  assert.ok(weak.indexOf('wasm') === weak.length - 1, 'slow local model is the LAST resort');
  assert.ok(weak.includes('peer') && weak.includes('server') && weak.includes('frontier'));
  assert.ok(!weak.includes('webgpu'), 'no webgpu offered on a no-GPU device');
  // capable device uses its on-device coder, no wasm fallback
  const strong = codeSources({ hardware: 'high' });
  assert.ok(strong.includes('webgpu') && !strong.includes('wasm'));
  // weak local profile = more iterations of cheap patches + brick-heavy; remote = lean
  const w = loopProfile({ hardware: 'none' }, 'wasm');
  assert.ok(w.maxIters >= 8 && w.bricksHeavy && w.maxFiles <= 12);
  assert.ok(loopProfile({ hardware: 'none' }, 'peer').maxIters <= 4);
});

test('remote-coder: HTTP + peer offload generation, drop into the loop', async () => {
  const { makeHttpCoder, makePeerCoder, serveCoder } = await import('../lib/oioxo/remote-coder.ts');
  const { runCodeLoop } = await import('../lib/oioxo/codeloop.ts');
  // HTTP coder: a fake endpoint returns edits → generate yields them
  const fakeFetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    return { ok: true, json: async () => ({ edits: [{ path: 'a.ts', content: 'FIXED:' + body.task }] }) };
  };
  const httpGen = makeHttpCoder('https://gpu/code', { fetchImpl: fakeFetch });
  const e = await httpGen({ task: 't', files: [{ path: 'a.ts', content: 'x' }], attempt: 0 });
  assert.equal(e[0].content, 'FIXED:t');

  // PEER coder over loopback: weak device's LOOP runs locally, a GPU peer generates
  const reg = {};
  const connect = (role, room, h) => {
    reg[role] = h;
    queueMicrotask(() => { if (reg.s && reg.r) { reg.s.onState?.('connected'); reg.r.onState?.('connected'); } });
    const other = () => reg[role === 's' ? 'r' : 's'];
    return { send: (d) => { const o = other(); if (o) queueMicrotask(() => o.onMessage?.(d)); return true; }, sendBinary: () => true, close: () => {} };
  };
  // the GPU peer's local generator fixes the file on the first ask
  const peerCoder = makePeerCoder({ connect, timeoutMs: 2000 });
  serveCoder(peerCoder.room, async () => [{ path: 'a.ts', content: 'FIXED' }], { connect });
  await new Promise((r) => setTimeout(r, 10));
  const res = await runCodeLoop({
    task: 't', files: [{ path: 'a.ts', content: 'broken' }], testCmd: 'x', maxIters: 3,
    generate: peerCoder.generate,
    run: async (f) => ({ ok: f[0].content === 'FIXED', output: '', errors: f[0].content === 'FIXED' ? '' : 'e' }),
  });
  assert.equal(res.ok, true, 'weak device reached green via a peer-generated edit');
  peerCoder.cancel();
});

// ---------- distributed oracle over P2P (Gem 5) ----------
test('remote-oracle: a driver loop is verified by a remote worker (loopback)', async () => {
  const { driveWithRemoteOracle, serveOracle } = await import('../lib/oioxo/remote-oracle.ts');
  const { runCodeLoop } = await import('../lib/oioxo/codeloop.ts');
  // loopback transport (same shape as the share tests)
  const reg = {};
  const connect = (role, room, h) => {
    reg[role] = h;
    queueMicrotask(() => { if (reg.s && reg.r) { reg.s.onState?.('connected'); reg.r.onState?.('connected'); } });
    const other = () => reg[role === 's' ? 'r' : 's'];
    return { send: (d) => { const o = other(); if (o) queueMicrotask(() => o.onMessage?.(d)); return true; }, sendBinary: () => true, close: () => {} };
  };
  // WORKER: its local oracle says green iff the file contains FIXED. Tracks jobs seen.
  let jobs = 0;
  const workerRun = async (files) => {
    const ok = files.some((f) => f.content.includes('FIXED'));
    return { ok, output: ok ? 'ok' : 'still red', errors: ok ? '' : 'TS1: broken' };
  };
  const driver = driveWithRemoteOracle({ connect, timeoutMs: 2000 });
  serveOracle(driver.room, async (f, c) => { jobs++; return workerRun(f, c); }, { connect });
  await new Promise((r) => setTimeout(r, 10)); // let the loopback connect

  // The DRIVER runs the loop but every verification happens on the WORKER.
  let attempt = 0;
  const generate = async () => { attempt++; return [{ path: 'a.ts', content: attempt >= 2 ? 'FIXED' : 'broken' }]; };
  const res = await runCodeLoop({ task: 't', files: [{ path: 'a.ts', content: 'broken' }], testCmd: 'verify', maxIters: 4, generate, run: driver.run });
  assert.equal(res.ok, true, 'reached green via the remote oracle');
  assert.ok(jobs >= 2, 'the worker actually did the verification work');
  driver.cancel();
});

// ---------- regression safety (Gem 6b) ----------
test('regression: guard flags a once-passing check that breaks + checkpoints all-green', async () => {
  const { RegressionGuard, parseFailingChecks } = await import('../lib/oioxo/regression.ts');
  const g = new RegressionGuard();
  const f1 = [{ path: 'i.html', content: 'v1' }];
  // step 1: only c1 exists and passes → all-green checkpoint
  let u = g.update(f1, ['c1'], []);
  assert.equal(u.ok, true); assert.equal(u.checkpointed, true);
  // step 2: add c2; both pass → checkpoint advances
  const f2 = [{ path: 'i.html', content: 'v2' }];
  u = g.update(f2, ['c1', 'c2'], []);
  assert.equal(u.checkpointed, true);
  // step 3: an edit makes c1 (which passed before) fail → REGRESSION, not accepted
  u = g.update([{ path: 'i.html', content: 'v3' }], ['c1', 'c2'], ['c1']);
  assert.equal(u.ok, false);
  assert.deepEqual(u.regressions, ['c1']);
  assert.equal(u.checkpointed, false);
  // rollback target is the last all-green files (v2)
  assert.equal(g.lastGood()[0].content, 'v2');
  // parse failing checks from a preview-oracle report
  const p = parseFailingChecks('not yet: has a button\nReferenceError: x is not defined\nnot yet: shows a number');
  assert.deepEqual(p.failing, ['has a button', 'shows a number']);
  assert.equal(p.runtimeErrors.length, 1);
});

test('regression: makeRegressionRun turns a regression into a loop-fixable failure', async () => {
  const { RegressionGuard, makeRegressionRun } = await import('../lib/oioxo/regression.ts');
  const g = new RegressionGuard();
  const checks = ['a', 'b'];
  const base = async (files) => {
    // oracle: fail the checks named in the file content (after "fail:")
    const fail = (files[0].content.match(/fail:(.*)/)?.[1] || '').split(',').filter(Boolean);
    return { ok: fail.length === 0, output: '', errors: fail.map((c) => 'not yet: ' + c).join('\n') };
  };
  const run = makeRegressionRun(base, g, () => checks);
  // both pass → ok
  assert.equal((await run([{ path: 'x', content: 'fail:' }], 'c')).ok, true);
  // now break 'a' (passed before) → regression surfaced as a failure with a clear msg
  const r = await run([{ path: 'x', content: 'fail:a' }], 'c');
  assert.equal(r.ok, false);
  assert.ok(/regression:.*a/.test(r.errors));
});

// ---------- capability graph for app composition (Gem 6) ----------
test('compose-app: needs inference + dependency-ordered plan + glue gaps', async () => {
  const { neededCapabilities, planApp, APP_BRICKS } = await import('../lib/oioxo/compose-app.ts');
  // a todo app needs list state + ui + persistence
  const needs = neededCapabilities('a todo list app that saves my items');
  assert.deepEqual(needs, ['list-state', 'list-ui', 'persistence']);
  const plan = planApp(needs, APP_BRICKS);
  const order = plan.bricks.map((b) => b.provides[0]);
  // list-state must come before list-ui (which requires it) and persistence (requires it)
  assert.ok(order.indexOf('list-state') < order.indexOf('list-ui'), 'state before ui');
  assert.ok(order.indexOf('list-state') < order.indexOf('persistence'), 'state before persistence');
  assert.deepEqual(plan.glue, [], 'all todo needs covered by verified bricks');
  assert.equal(plan.unmetRequires.length, 0);

  // a need with no provider becomes GLUE the model must write
  const plan2 = planApp(['list-state', 'voice-input'], APP_BRICKS);
  assert.ok(plan2.satisfied.includes('list-state'));
  assert.deepEqual(plan2.glue, ['voice-input']);

  // transitive requires get pulled in even if only the top need is asked for
  const plan3 = planApp(['list-ui'], APP_BRICKS);
  assert.ok(plan3.bricks.some((b) => (b.provides || []).includes('list-state')), 'pulled in list-state dependency');
});

// ---------- trajectory replay / memoization (Gem 3) ----------
test('solutions: match + replayMode thresholds', async () => {
  const { makeSolution, matchSolution, replayMode } = await import('../lib/oioxo/solutions.ts');
  const sols = [
    makeSolution('build a todo list app', [{ path: 'i.html', content: '<ul></ul>' }]),
    makeSolution('a snake game on canvas', [{ path: 'i.html', content: '<canvas></canvas>' }]),
  ];
  // exact (normalized) → score 1
  assert.equal(matchSolution('Build a Todo List App', sols).score, 1);
  // related → some overlap, picks the todo one
  const m = matchSolution('make me a todo list', sols);
  assert.ok(m && /todo/.test(m.solution.goal));
  // unrelated → below floor → null
  assert.equal(matchSolution('a php payment gateway', sols, 0.5), null);
  assert.equal(replayMode(1), 'exact'); assert.equal(replayMode(0.6), 'warm'); assert.equal(replayMode(0.2), 'none');
});

test('solutions: replayOrBuild — exact replays (0 model calls), warm-starts, else scratch', async () => {
  const { replayOrBuild, makeSolution } = await import('../lib/oioxo/solutions.ts');
  const cached = makeSolution('build a todo list app', [{ path: 'i.html', content: '<ul id="list"></ul>' }]);
  const recall = (goal) => Promise.resolve(
    /todo/.test(goal) ? { solution: cached, score: goal === 'build a todo list app' ? 1 : 0.6 } : null);
  // verify: the cached project is still green
  const verifyOk = () => Promise.resolve({ ok: true, output: 'ok', errors: '' });
  let built = 0;
  const build = async (startFiles) => { built++; return { files: [...startFiles, { path: 'new.js', content: 'x' }], ok: true, iters: 1, modelCalls: 5 }; };

  // 1) EXACT goal + verifies → replay, ZERO model calls, no build
  const exact = await replayOrBuild({ goal: 'build a todo list app', scratchFiles: [], recall, verify: verifyOk, build });
  assert.equal(exact.replayed, true); assert.equal(exact.modelCalls, 0); assert.equal(built, 0);

  // 2) SIMILAR goal → warm start from the cached files (build sees them)
  let warmStart = null;
  const build2 = async (startFiles) => { warmStart = startFiles; return { files: startFiles, ok: true, iters: 1, modelCalls: 2 }; };
  const warm = await replayOrBuild({ goal: 'make me a todo list', scratchFiles: [{ path: 'blank', content: '' }], recall, verify: () => Promise.resolve({ ok: false, output: '', errors: 'e' }), build: build2 });
  assert.equal(warm.warmStarted, true);
  assert.equal(warmStart[0].path, 'i.html', 'build started from the cached solution, not blank');

  // 3) UNRELATED goal → scratch build
  const scratch = await replayOrBuild({ goal: 'a php gateway', scratchFiles: [{ path: 'blank', content: '' }], recall, verify: verifyOk, build });
  assert.equal(scratch.replayed, false); assert.equal(scratch.warmStarted, false);
});

// ---------- adaptive oracle search (Gem 2) ----------
test('codeloop: adaptive search ramps candidates when stuck → green where single-shot fails', async () => {
  const { runCodeLoop } = await import('../lib/oioxo/codeloop.ts');
  // The "correct" fix only appears on the 4th generate call. A constant error makes
  // the loop STUCK, so adaptive search must widen the candidate count to reach it.
  const mk = (maxCandidates) => {
    let calls = 0; let maxEffort = 0;
    const generate = async (ctx) => {
      calls++; maxEffort = Math.max(maxEffort, ctx.effort ?? 0);
      const good = calls >= 4; // the winning candidate
      return [{ path: 'a.js', content: good ? 'FIXED' : 'broken' }];
    };
    const run = async (files) => {
      const ok = files.some((f) => f.path === 'a.js' && f.content === 'FIXED');
      return { ok, output: ok ? 'ok' : 'E', errors: ok ? '' : 'TS1: constant error' };
    };
    return { generate, run, maxCandidates, get calls() { return calls; }, get maxEffort() { return maxEffort; } };
  };
  // Without adaptive (cap = base 1): only 1 call/attempt, 3 attempts → never hits call #4.
  const flat = mk(undefined);
  const r1 = await runCodeLoop({ task: 't', files: [{ path: 'a.js', content: 'broken' }], testCmd: 'x', maxIters: 3, generate: flat.generate, run: flat.run });
  assert.equal(r1.ok, false, 'single-shot cannot reach the 4th candidate in 3 attempts');
  // With adaptive (cap 4): stuck on the same error ramps candidates → reaches call #4 → green.
  const ad = mk(4);
  const r2 = await runCodeLoop({ task: 't', files: [{ path: 'a.js', content: 'broken' }], testCmd: 'x', maxIters: 3, candidates: 1, maxCandidates: 4, generate: ad.generate, run: ad.run });
  assert.equal(r2.ok, true, 'adaptive search reaches green by widening when stuck');
  assert.ok(ad.maxEffort >= 1, 'effort was escalated and passed to the generator');
});

// ---------- patch: constrained JSON edits (Gem 1) ----------
test('patch: parseJsonEdits + parseAnyPatch (constrained-decoding repair format)', async () => {
  const { parseJsonEdits, parseAnyPatch, applyHunks } = await import('../lib/oioxo/patch.ts');
  // canonical {edits:[...]}
  const a = parseJsonEdits('{"edits":[{"find":"ms: string","replace":"ms: number"}]}', 'u.ts');
  assert.equal(a.length, 1); assert.equal(a[0].search, 'ms: string'); assert.equal(a[0].replace, 'ms: number'); assert.equal(a[0].path, 'u.ts');
  // bare array + field aliases (old/new, search/with) + per-edit path
  const b = parseJsonEdits('[{"old":"a","new":"b","path":"x.ts"},{"search":"c","with":"d"}]', 'def.ts');
  assert.deepEqual(b.map((h) => [h.path, h.search, h.replace]), [['x.ts', 'a', 'b'], ['def.ts', 'c', 'd']]);
  // tolerant: JSON wrapped in prose / fences still extracted
  assert.equal(parseJsonEdits('Sure! ```json\n{"edits":[{"find":"x","replace":"y"}]}\n```', 'u.ts').length, 1);
  // the prose that corrupted a file in the live test → NO edits (safe)
  assert.equal(parseJsonEdits('SEARCH/REPLACE: Replace `ms` with a number.', 'u.ts').length, 0);
  // parseAnyPatch prefers JSON, falls back to markers
  assert.equal(parseAnyPatch('{"edits":[{"find":"x","replace":"y"}]}', 'u.ts').length, 1);
  assert.equal(parseAnyPatch('<<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE', 'u.ts').length, 1);
  // end-to-end: JSON edit applies via the same hunk engine
  const r = applyHunks('let ms: string = 0;\n', parseJsonEdits('{"edits":[{"find":"ms: string","replace":"ms: number"}]}'));
  assert.ok(r.content.includes('ms: number'));
});

// ---------- recipes (grounding) ----------
test('recipes: match task types, null otherwise', async () => {
  const { recipeFor } = await import('../lib/oioxo/recipes.ts');
  assert.equal(recipeFor('build a pacman game')?.kind, 'canvas-game');
  assert.equal(recipeFor('snake on canvas')?.kind, 'canvas-game');
  assert.equal(recipeFor('a todo list app')?.kind, 'list-app');
  assert.equal(recipeFor('a calculator')?.kind, 'calculator');
  assert.equal(recipeFor('a signup form')?.kind, 'form');
  assert.equal(recipeFor('some random thing'), null);
  assert.ok((recipeFor('pacman')?.guidance || '').includes('MAZE'));
  // behavioral checks (drive "is actually the thing", not just "runs")
  const g = recipeFor('pacman game');
  assert.ok(g.checks && g.checks.length >= 3, 'game has checks');
  assert.ok(g.checks.some((c) => /keyboard/i.test(c.name)), 'game checks keyboard input');
  assert.ok(g.checks.every((c) => typeof c.src === 'string' && c.src.length > 0));
  assert.ok(recipeFor('a todo list').checks.some((c) => /input/i.test(c.name)));
});

// ---------- code-search (search-when-stuck query) ----------
test('code-search: errorQuery distills a searchable query', async () => {
  const { errorQuery } = await import('../lib/oioxo/code-search.ts');
  const q = errorQuery("Uncaught ReferenceError: drawMaze is not defined @ game.js:42");
  assert.ok(/ReferenceError/.test(q) && /drawMaze is not defined/.test(q));
  assert.ok(!/game\.js:42/.test(q)); // path:line stripped
  assert.ok(q.length <= 120);
  assert.equal(errorQuery(''), '');
});

// ---------- engine-error classifier ----------
test('codeloop: isEngineError flags infra failures, not code errors', async () => {
  const { isEngineError } = await import('../lib/oioxo/codeloop.ts');
  assert.ok(isEngineError('Model not loaded before trying to complete ChatCompletionRequest'));
  assert.ok(isEngineError("Failed to execute 'mapAsync' on 'GPUBuffer': Buffer was unmapped"));
  assert.ok(isEngineError('WebGPU device was lost'));
  assert.equal(isEngineError("TS2322: Type 'string' is not assignable to type 'number'"), false);
  assert.equal(isEngineError('ReferenceError: drawMaze is not defined'), false);
  assert.equal(isEngineError(''), false);
});

// ---------- remember (recall scoring) ----------
test('trajectory: overlapScore ranks similar errors higher', async () => {
  const { overlapScore } = await import('../lib/oioxo/trajectory-store.ts');
  const a = 'ReferenceError drawMaze is not defined in game render';
  const close = 'ReferenceError drawMaze is not defined when rendering';
  const far = 'SyntaxError unexpected token in package json config';
  assert.ok(overlapScore(a, close) > overlapScore(a, far));
  assert.equal(overlapScore('', 'x'), 0);
  assert.ok(overlapScore(a, a) > 0.9);
});

// ---------- agent ----------
test('agent: parsePlan (JSON + list + degrade)', async () => {
  const { parsePlan } = await import('../lib/oioxo/agent.ts');
  assert.equal(parsePlan('["a","b","c"]').length, 3);
  assert.equal(parsePlan('```json\n[{"title":"S","task":"do"}]\n```')[0].task, 'do');
  assert.equal(parsePlan('1. first\n2) second\n- third').length, 3);
  assert.equal(parsePlan('no list').length, 0);
});

test('agent: runAgent event order + StepContext + change tracking', async () => {
  const { runAgent } = await import('../lib/oioxo/agent.ts');
  const plan = async () => [{ title: 'a', task: 'A' }, { title: 'b', task: 'B' }];
  const ctxs = [];
  const build = async (task, files, ctx) => { ctxs.push(ctx); return { files: [...files, { path: ctx.index + '.js', content: 'x' }], ok: true, iters: 1 }; };
  const events = [];
  const gen = runAgent({ goal: 'G', files: [], plan, build });
  let ret; while (true) { const n = await gen.next(); if (n.done) { ret = n.value; break; } events.push(n.value.type); }
  assert.deepEqual(events, ['plan', 'step-start', 'step-done', 'files', 'step-start', 'step-done', 'files', 'done']);
  assert.equal(ctxs[0].goal, 'G'); assert.equal(ctxs[1].index, 1); assert.equal(ctxs[1].total, 2);
  assert.equal(ret.files.length, 2);
});

test('agent: planner degrades to one step when planning fails', async () => {
  const { runAgent } = await import('../lib/oioxo/agent.ts');
  const gen = runAgent({ goal: 'do X', files: [], plan: async () => { throw new Error('x'); }, build: async (t, f) => ({ files: f, ok: true, iters: 1 }) });
  let planEv; while (true) { const n = await gen.next(); if (n.done) break; if (n.value.type === 'plan') planEv = n.value; }
  assert.equal(planEv.steps.length, 1); assert.equal(planEv.steps[0].task, 'do X');
});

// ---------- github ----------
test('github: parseRepoRef + utf8 b64 + changedFiles', async () => {
  const { parseRepoRef, b64encodeUtf8, b64decodeUtf8, changedFiles } = await import('../lib/oioxo/github.ts');
  assert.deepEqual(parseRepoRef('o/r'), { owner: 'o', repo: 'r', branch: undefined });
  assert.deepEqual(parseRepoRef('https://github.com/a/b/tree/dev'), { owner: 'a', repo: 'b', branch: 'dev' });
  assert.equal(parseRepoRef('not a repo !!'), null);
  const u = 'héllo 世界 🚀'; assert.equal(b64decodeUtf8(b64encodeUtf8(u)), u);
  assert.deepEqual(changedFiles([{ path: 'a', content: '1' }], [{ path: 'a', content: '2' }, { path: 'b', content: 'n' }]).map((f) => f.path).sort(), ['a', 'b']);
});

test('github: open + push (fake fetcher) — only changed files, base_tree, advances', async () => {
  const { openGitHubWorkspace, b64encodeUtf8 } = await import('../lib/oioxo/github.ts');
  const calls = [];
  const j = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => '' });
  const fake = async (url, init = {}) => {
    if (url.endsWith('/repos/o/r')) return j({ default_branch: 'main' });
    if (url.includes('/git/ref/heads/main')) return j({ object: { sha: 'H1' } });
    if (url.includes('/git/commits/H1')) return j({ tree: { sha: 'T1' } });
    if (url.includes('/git/trees/T1?recursive=1')) return j({ tree: [{ path: 'index.js', type: 'blob', size: 5, sha: 'B1' }] });
    if (url.includes('/git/blobs/B1')) return j({ content: b64encodeUtf8('old'), encoding: 'base64' });
    if (url.endsWith('/git/trees') && init.method === 'POST') { calls.push(['tree', JSON.parse(init.body)]); return j({ sha: 'T2' }); }
    if (url.endsWith('/git/commits') && init.method === 'POST') { calls.push(['commit', JSON.parse(init.body)]); return j({ sha: 'C2' }); }
    if (url.includes('/git/refs/heads/main') && init.method === 'PATCH') return j({});
    if (url.includes('/git/commits/C2')) return j({ tree: { sha: 'T2' } });
    throw new Error('unexpected ' + url);
  };
  const ws = await openGitHubWorkspace('tok', { owner: 'o', repo: 'r' }, fake);
  await ws.write('index.js', 'new'); await ws.write('extra.js', 'z');
  const r = await ws.push('msg');
  assert.equal(r.changed, 2);
  const tree = calls.find((c) => c[0] === 'tree')[1];
  assert.equal(tree.base_tree, 'T1');
  assert.deepEqual(tree.tree.map((t) => t.path).sort(), ['extra.js', 'index.js']);
  assert.deepEqual(ws.pending(), []); // base advanced
});

// ---------- share + live co-edit ----------
test('share: projectMessages + ShareReceiver round-trip', async () => {
  const { projectMessages, ShareReceiver } = await import('../lib/oioxo/share.ts');
  const payload = { meta: { name: 'x', preview: true }, files: [{ path: 'a.js', content: '1' }, { path: 'b.js', content: '2' }] };
  const rx = new ShareReceiver(); let done = null;
  for (const m of projectMessages(payload)) { const r = rx.accept(m); if (r) done = r; }
  assert.deepEqual(done.files, payload.files); assert.deepEqual(done.meta, payload.meta);
});

test('share: bidirectional live co-edit over loopback transport', async () => {
  const { sendProject, receiveProject } = await import('../lib/oioxo/share.ts');
  const reg = {};
  const connect = (role, room, h) => {
    reg[role] = h;
    queueMicrotask(() => { if (reg.s && reg.r) { reg.s.onState?.('connected'); reg.r.onState?.('connected'); } });
    const other = () => reg[role === 's' ? 'r' : 's'];
    return { send: (d) => { const o = other(); if (o) queueMicrotask(() => o.onMessage?.(d)); return true; }, sendBinary: () => true, close: () => {} };
  };
  const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
  const payload = { meta: { name: 'demo', template: 'web', preview: true }, files: [{ path: 'i.html', content: '<h1>v1</h1>' }] };
  let received = null; const rE = [], sE = [];
  const rx = receiveProject('room', { connect, onComplete: (p) => { received = p; }, onRemoteEdit: (p, c) => rE.push([p, c]) });
  const tx = sendProject(payload, { connect, onRemoteEdit: (p, c) => sE.push([p, c]) });
  await wait();
  assert.deepEqual(received.files, payload.files);
  tx.sendEdit('i.html', '<h1>v2</h1>'); await wait();
  assert.deepEqual(rE.at(-1), ['i.html', '<h1>v2</h1>']);
  rx.sendEdit('s.css', 'body{}'); await wait();
  assert.deepEqual(sE.at(-1), ['s.css', 'body{}']);
});

// ---------- entitlement + protect (crypto) ----------
test('crypto: entitlement sign/verify/tamper/device', async () => {
  const { signEntitlement, verifyEntitlement } = await import('../lib/oioxo/entitlement.ts');
  const tok = await signEntitlement({ sub: 'u', device: 'd', tier: 'pro', features: ['pro-coder'] }, 'sec');
  assert.equal((await verifyEntitlement(tok, 'sec', { expectDevice: 'd' })).ok, true);
  assert.equal((await verifyEntitlement(tok.slice(0, -2) + 'xx', 'sec')).ok, false);
  assert.equal((await verifyEntitlement(tok, 'sec', { expectDevice: 'z' })).reason, 'device-mismatch');
});

test('crypto: protect encrypt/decrypt + HKDF + wrong-key reject', async () => {
  const { randomKey, encryptAsset, decryptAsset, deriveUserKey } = await import('../lib/oioxo/protect.ts');
  const key = randomKey();
  const msg = new TextEncoder().encode('secret 世界 🔐');
  const back = await decryptAsset(await encryptAsset(msg, key), key);
  assert.equal(new TextDecoder().decode(back), 'secret 世界 🔐');
  let threw = false; try { await decryptAsset(await encryptAsset(msg, key), randomKey()); } catch { threw = true; }
  assert.ok(threw);
  const a = await deriveUserKey(key, 'u1'), b = await deriveUserKey(key, 'u1'), c = await deriveUserKey(key, 'u2');
  assert.deepEqual([...a], [...b]); assert.notDeepEqual([...a], [...c]);
});

// ---------- session unlock (hard-like-a-rock model/corpus gate) ----------
test('unlock: ECDHE session gate — recovers the key only with a live device-bound entitlement', async () => {
  const { signEntitlement } = await import('../lib/oioxo/entitlement.ts');
  const { randomKey, encryptAsset, decryptAsset } = await import('../lib/oioxo/protect.ts');
  const { genEphemeral, mintUnlock, openUnlock, deriveAssetKey, isDenied } = await import('../lib/oioxo/unlock.ts');
  const td = new TextDecoder();
  const master = randomKey(), secret = 'server-master-secret', device = 'dev-1', assetId = 'coder-1.5b', release = 'v3';

  // build-time: the model ships encrypted with the per-release asset key
  const assetKey = await deriveAssetKey(master, assetId, release);
  const encModel = await encryptAsset(new TextEncoder().encode('SECRET WEIGHTS 🧠'), assetKey);

  // happy path: pro entitlement on this device → handshake → recovers the key → decrypts
  const ent = await signEntitlement({ sub: 'u1', device, tier: 'pro', features: ['pro-coder'] }, secret, { ttlMs: 3600_000 });
  const eph = await genEphemeral();
  const grant = await mintUnlock({ entitlement: ent, device, assetId, clientPubB64: eph.publicKeyB64 }, { secret, assetKey, release, feature: 'pro-coder' });
  assert.ok(!isDenied(grant), 'valid entitlement should grant');
  const k = await openUnlock(eph, grant, 'u1', device);
  assert.equal(td.decode(await decryptAsset(encModel, k)), 'SECRET WEIGHTS 🧠', 'recovered key decrypts the model');

  // ATTACKS — every one must fail to yield the key:
  // wrong device
  const g1 = await mintUnlock({ entitlement: ent, device: 'other-dev', assetId, clientPubB64: eph.publicKeyB64 }, { secret, assetKey, release, feature: 'pro-coder' });
  assert.ok(isDenied(g1) && g1.reason === 'device-mismatch');
  // no Pro feature
  const entFree = await signEntitlement({ sub: 'u2', device, tier: 'free', features: [] }, secret);
  const g2 = await mintUnlock({ entitlement: entFree, device, assetId, clientPubB64: eph.publicKeyB64 }, { secret, assetKey, feature: 'pro-coder' });
  assert.ok(isDenied(g2) && g2.reason === 'missing-feature');
  // expired entitlement
  const entOld = await signEntitlement({ sub: 'u1', device, tier: 'pro', features: ['pro-coder'] }, secret, { ttlMs: 1000, now: Date.now() - 120_000 });
  const g3 = await mintUnlock({ entitlement: entOld, device, assetId, clientPubB64: eph.publicKeyB64 }, { secret, assetKey, feature: 'pro-coder' });
  assert.ok(isDenied(g3) && g3.reason === 'expired');
  // forged signature (attacker's own secret)
  const entForged = await signEntitlement({ sub: 'h4x', device, tier: 'pro', features: ['pro-coder'] }, 'attacker-secret');
  const g4 = await mintUnlock({ entitlement: entForged, device, assetId, clientPubB64: eph.publicKeyB64 }, { secret, assetKey, feature: 'pro-coder' });
  assert.ok(isDenied(g4) && g4.reason === 'bad-signature');
  // INTERCEPTED grant opened with the attacker's own ephemeral key → useless
  const good = await mintUnlock({ entitlement: ent, device, assetId, clientPubB64: eph.publicKeyB64 }, { secret, assetKey, release, feature: 'pro-coder' });
  const attacker = await genEphemeral();
  let stolen = false;
  try { stolen = td.decode(await decryptAsset(encModel, await openUnlock(attacker, good, 'u1', device))) === 'SECRET WEIGHTS 🧠'; } catch { stolen = false; }
  assert.equal(stolen, false, 'a captured grant is useless without this session ephemeral private key');
  // tampered wrapped blob → open throws
  let threw = false;
  try { await openUnlock(eph, { ...good, wrapped: { ...good.wrapped, ct: good.wrapped.ct.slice(0, -4) + 'AAAA' } }, 'u1', device); } catch { threw = true; }
  assert.ok(threw, 'tampered grant must not open');
});

// ---------- shared usage/billing meter (same logic web + desktop) ----------
test('usage-client: CodeMeter start/stop, clamp, fail-open, formatRemaining', async () => {
  const { CodeMeter, formatRemaining } = await import('../lib/oioxo/usage-client.ts');
  const calls = [];
  const fakeFetch = async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url, body, auth: init.headers.Authorization });
    if (body.action === 'start') return { json: async () => ({ allowed: true, remainingSeconds: 1800 }) };
    return { json: async () => ({ allowed: true, remainingSeconds: 1500 }) };
  };
  // desktop-style: absolute endpoint + bearer token; both surfaces share this class
  const m = new CodeMeter({ endpoint: 'https://oioxo.com/api/usage/code', fetchImpl: fakeFetch, authHeaders: () => ({ Authorization: 'Bearer tok' }), maxReport: 600 });
  const s = await m.start();
  assert.equal(s.allowed, true); assert.ok(m.running);
  assert.equal(calls[0].url, 'https://oioxo.com/api/usage/code');
  assert.equal(calls[0].auth, 'Bearer tok', 'desktop bearer token forwarded');
  await new Promise((r) => setTimeout(r, 1100)); // ≥1s so the report fires
  const e = await m.stop();
  assert.ok(e && e.remainingSeconds === 1500); assert.equal(m.running, false);
  assert.equal(calls[1].body.action, 'report'); assert.ok(calls[1].body.seconds >= 0 && calls[1].body.seconds <= 600);
  // blocked start → not running
  const blocked = new CodeMeter({ fetchImpl: async () => ({ json: async () => ({ allowed: false, remainingSeconds: 0 }) }) });
  assert.equal((await blocked.start()).allowed, false); assert.equal(blocked.running, false);
  // network failure → fail OPEN (never lock out on a blip)
  const down = new CodeMeter({ fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal((await down.start()).allowed, true);
  // formatRemaining: unlimited vs minutes
  assert.equal(formatRemaining(null), 'Unlimited');
  assert.ok(/\d+ min of AI left/.test(formatRemaining(1800)));
});

// ---------- outline (editor symbol nav) ----------
test('outline: extracts TS/CSS/MD symbols with line numbers', async () => {
  const { extractOutline } = await import('../lib/oioxo/outline.ts');
  const ts = extractOutline('a.ts', [
    'export function foo() {}',          // 1
    'const bar = () => 2;',              // 2
    'export class Baz {}',               // 3
    'interface Shape { x: number }',     // 4
    'type Id = string;',                 // 5
    'export const Config = { a: 1 };',   // 6  (Capitalized const → variable)
    'let counter = 0;',                  // 7  (lowercase non-fn → ignored)
  ].join('\n'));
  const by = (n) => ts.find((s) => s.name === n);
  assert.equal(by('foo')?.kind, 'function'); assert.equal(by('foo')?.line, 1);
  assert.equal(by('bar')?.kind, 'function'); assert.equal(by('bar')?.line, 2);
  assert.equal(by('Baz')?.kind, 'class');
  assert.equal(by('Shape')?.kind, 'interface');
  assert.equal(by('Id')?.kind, 'type');
  assert.equal(by('Config')?.kind, 'variable');
  assert.equal(by('counter'), undefined, 'lowercase non-function const is not noise');
  // CSS selectors + at-rules
  const css = extractOutline('s.css', '.btn {\n  color: red;\n}\n@media (max-width: 600px) {\n}');
  assert.equal(css[0].name, '.btn'); assert.equal(css[0].kind, 'selector');
  assert.ok(css.some((s) => s.kind === 'rule' && /@media/.test(s.name)));
  // Markdown headings carry depth
  const md = extractOutline('r.md', '# Title\n## Section\ntext\n### Sub');
  assert.deepEqual(md.map((h) => [h.name, h.depth]), [['Title', 1], ['Section', 2], ['Sub', 3]]);
  // unknown language → empty (no false symbols)
  assert.deepEqual(extractOutline('x.bin', 'random bytes here'), []);
});

// ---------- compute credit (mesh: earn limit-time on your own hardware) ----------
test('compute-credit: issue → verify → redeem grants reimbursed seconds', async () => {
  const { issueReceipt, CreditLedger, canonicalPayload } =
    await import('../lib/oioxo/compute-credit.ts');
  // Fake account-bound crypto: signature = "sig:" + canonical. Verifier checks the match.
  const sign = (c) => 'sig:' + c;
  const verify = (c, s) => s === 'sig:' + c;
  let n = 0;
  const r = await issueReceipt(
    { deviceId: 'mac', seq: 1, jobHash: 'h1', servedSec: 42, tokensOut: 100,
      now: () => 1000, nonce: () => `nn${++n}` },
    sign,
  );
  // servedSec*1 + tokensOut*0.02 = 42 + 2 = 44 (under the 300 clamp).
  assert.ok(r.sig.startsWith('sig:'), 'receipt is signed');
  // the signed bytes are the canonical payload (no sig field)
  const { sig: _omit, ...payload } = r;
  assert.equal(r.sig, 'sig:' + canonicalPayload(payload));
  const led = new CreditLedger(undefined, { now: () => 2000 });
  const res = await led.redeem(r, verify);
  assert.equal(res.reason, 'granted');
  assert.equal(res.granted, 44);
  assert.equal(led.grantedTodaySec(), 44);
});

test('compute-credit: replay + tamper + expiry are rejected', async () => {
  const { issueReceipt, CreditLedger } = await import('../lib/oioxo/compute-credit.ts');
  const sign = (c) => 'sig:' + c;
  const verify = (c, s) => s === 'sig:' + c;
  const mk = (over) => issueReceipt(
    { deviceId: 'mac', seq: 1, jobHash: 'h', servedSec: 10, tokensOut: 0,
      now: () => 1000, nonce: () => 'x', ...over },
    sign,
  );
  const led = new CreditLedger(undefined, { now: () => 2000 });
  const r = await mk();
  assert.equal((await led.redeem(r, verify)).reason, 'granted');
  // same (deviceId, seq) again → duplicate, no double-grant
  assert.equal((await led.redeem(r, verify)).reason, 'duplicate');
  // tampered servedSec invalidates the signature
  const t = { ...(await mk({ seq: 2 })), servedSec: 9999 };
  assert.equal((await led.redeem(t, verify)).reason, 'bad-signature');
  // stale receipt (older than maxAge) rejected
  const old = await mk({ seq: 3, now: () => 0 });
  const future = new CreditLedger(undefined, { now: () => 1000 * 60 * 60 * 24 * 30 });
  assert.equal((await future.redeem(old, verify)).reason, 'expired');
});

test('compute-credit: per-receipt clamp + daily cap (the Pro lever)', async () => {
  const { issueReceipt, CreditLedger, creditForReceipt, DEFAULT_POLICY } =
    await import('../lib/oioxo/compute-credit.ts');
  const sign = (c) => 'sig:' + c;
  const verify = (c, s) => s === 'sig:' + c;
  // A huge job is clamped to maxPerReceiptSec (300).
  const big = await issueReceipt(
    { deviceId: 'd', seq: 1, jobHash: 'h', servedSec: 99999, tokensOut: 0,
      now: () => 1, nonce: () => 'a' }, sign);
  assert.equal(creditForReceipt(big, DEFAULT_POLICY), 300);
  // Fill the day to one clamp short of the cap, then redeem → partial grant to the cap.
  const led = new CreditLedger(DEFAULT_POLICY, { now: () => 10, grantedTodaySec: 3600 - 100 });
  const res = await led.redeem(big, verify);
  assert.equal(res.granted, 100);            // only the remaining room
  assert.equal(res.reason, 'granted');
  assert.equal(led.grantedTodaySec(), 3600); // capped
  // next one is fully blocked but its key is still reserved (no replay later)
  const more = await issueReceipt(
    { deviceId: 'd', seq: 2, jobHash: 'h', servedSec: 50, tokensOut: 0,
      now: () => 11, nonce: () => 'b' }, sign);
  assert.equal((await led.redeem(more, verify)).reason, 'daily-cap');
  assert.ok(led.seenKeys().includes('d:2'));
});

// ---------- compute mesh: receipt flows provider → consumer → credit (stage 2) ----------
test('mesh-receipt: served job mints a receipt the consumer banks, matches + redeems', async () => {
  const { makePeerCoder, serveCoder } = await import('../lib/oioxo/remote-coder.ts');
  const { makeReceiptIssuer, receiptMatchesJob } = await import('../lib/oioxo/mesh-receipt.ts');
  const { CreditLedger } = await import('../lib/oioxo/compute-credit.ts');

  // account-bound fake crypto + a trivial deterministic hash
  const sign = (c) => 'sig:' + c;
  const verify = (c, s) => s === 'sig:' + c;
  const hash = (s) => 'h' + s.length;

  // loopback transport (same shape as the other remote-coder tests)
  const reg = {};
  const connect = (role, room, h) => {
    reg[role] = h;
    queueMicrotask(() => { if (reg.s && reg.r) { reg.s.onState?.('connected'); reg.r.onState?.('connected'); } });
    const other = () => reg[role === 's' ? 'r' : 's'];
    return { send: (d) => { const o = other(); if (o) queueMicrotask(() => o.onMessage?.(d)); return true; }, sendBinary: () => true, close: () => {} };
  };

  const banked = [];
  const peerCoder = makePeerCoder({ connect, timeoutMs: 2000, onReceipt: (r) => banked.push(r) });
  const issuer = makeReceiptIssuer({ deviceId: 'mac', sign, hash });
  // A realistically-sized edit so the token-based credit rounds to >= 1s (sub-second,
  // tiny jobs legitimately earn ~0 — credit tracks real work).
  const fixed = 'FIXED ' + 'x'.repeat(260);
  serveCoder(peerCoder.room, async () => [{ path: 'a.ts', content: fixed }], { connect, issueReceipt: issuer.issue });
  await new Promise((r) => setTimeout(r, 10));

  const ctx = { task: 't', files: [{ path: 'a.ts', content: 'broken' }], attempt: 0 };
  const edits = await peerCoder.generate(ctx);
  assert.ok(edits[0].content.startsWith('FIXED'));
  await new Promise((r) => setTimeout(r, 5)); // let the receipt message arrive

  // consumer banked exactly one receipt, signed by the provider device
  assert.equal(banked.length, 1, 'one receipt banked');
  assert.equal(banked[0].deviceId, 'mac');
  assert.equal(banked[0].seq, 0);
  assert.ok(banked[0].tokensOut > 0, 'tokensOut measured from served edits');

  // the fingerprint ties the receipt to the exact job the consumer sent + received
  assert.equal(await receiptMatchesJob(banked[0], ctx, edits, hash), true);
  assert.equal(await receiptMatchesJob(banked[0], { ...ctx, task: 'other' }, edits, hash), false);

  // and it redeems into credit on the limit ledger
  const led = new CreditLedger(undefined, { now: () => banked[0].issuedAt + 1 });
  const res = await led.redeem(banked[0], verify);
  assert.equal(res.reason, 'granted');
  assert.ok(res.granted >= 1, 'served work granted credit seconds');
  peerCoder.cancel();
});

// ---------- mesh fabric: any device is a capability-typed helper (stage 3A) ----------
test('mesh: registry filters by capability + availability, ranks load/health/latency', async () => {
  const { HelperRegistry } = await import('../lib/oioxo/mesh.ts');
  const reg = new HelperRegistry();
  reg.add({ id: 'mac', caps: ['generate', 'verify'], tier: 'high' });
  reg.add({ id: 'pc', caps: ['generate'], tier: 'mid' });
  reg.add({ id: 'phone', caps: ['verify', 'corpus'], tier: 'low' }); // weak device still helps

  // capability filter: phone can't generate, mac/pc can
  assert.deepEqual(reg.candidates('generate').map((h) => h.id).sort(), ['mac', 'pc']);
  assert.deepEqual(reg.candidates('verify').map((h) => h.id).sort(), ['mac', 'phone']);

  // load spreading: dispatch to mac → pc (0 inflight) now ranks ahead of mac (1 inflight)
  reg.recordStart('mac');
  assert.equal(reg.pick('generate').id, 'pc');
  reg.recordResult('mac', { ok: true, ms: 100 });
  // health: pc fails twice → its success rate drops, mac (proven) preferred
  reg.recordStart('pc'); reg.recordResult('pc', { ok: false, ms: 50 });
  reg.recordStart('pc'); reg.recordResult('pc', { ok: false, ms: 50 });
  assert.equal(reg.pick('generate').id, 'mac', 'flaky device de-prioritised');

  // availability: mac sleeps → pc is the only generator left
  reg.setAvailable('mac', false);
  assert.deepEqual(reg.candidates('generate').map((h) => h.id), ['pc']);
  assert.equal(reg.countFor('generate'), 1);
});

// ---------- coder pool: three devices, faster + churn-tolerant (stage 3B) ----------
test('coder-pool: race returns the FASTEST device’s result', async () => {
  const { HelperRegistry } = await import('../lib/oioxo/mesh.ts');
  const { makeCoderPool } = await import('../lib/oioxo/coder-pool.ts');
  const reg = new HelperRegistry();
  for (const id of ['slow', 'fast', 'mid']) reg.add({ id, caps: ['generate'], tier: 'mid' });
  const delays = { slow: 40, fast: 5, mid: 20 };
  const generatorFor = (id) => async () => {
    await new Promise((r) => setTimeout(r, delays[id]));
    return [{ path: 'a.ts', content: 'from-' + id }];
  };
  const pool = makeCoderPool({ registry: reg, generatorFor, mode: 'race', timeoutMs: 500 });
  const edits = await pool({ task: 't', files: [], attempt: 0 });
  assert.equal(edits[0].content, 'from-fast', 'fastest of three wins the race');
  assert.equal(reg.get('fast').health.done, 1);
});

test('coder-pool: best mode keeps the highest-scoring result across responders', async () => {
  const { HelperRegistry } = await import('../lib/oioxo/mesh.ts');
  const { makeCoderPool } = await import('../lib/oioxo/coder-pool.ts');
  const reg = new HelperRegistry();
  for (const id of ['a', 'b', 'c']) reg.add({ id, caps: ['generate'], tier: 'mid' });
  const len = { a: 1, b: 3, c: 2 };
  const generatorFor = (id) => async () =>
    Array.from({ length: len[id] }, (_, i) => ({ path: `f${i}.ts`, content: id }));
  const pool = makeCoderPool({
    registry: reg, generatorFor, mode: 'best', timeoutMs: 500,
    score: (edits) => edits.length, // prefer the most complete proposal
  });
  const edits = await pool({ task: 't', files: [], attempt: 0 });
  assert.equal(edits.length, 3, 'kept the richest candidate (b)');
  assert.equal(edits[0].content, 'b');
});

test('coder-pool: churn — drops/throws/empties never hang, healthy peer still answers', async () => {
  const { HelperRegistry } = await import('../lib/oioxo/mesh.ts');
  const { makeCoderPool } = await import('../lib/oioxo/coder-pool.ts');
  const reg = new HelperRegistry();
  for (const id of ['dead', 'empty', 'good']) reg.add({ id, caps: ['generate'], tier: 'mid' });
  const generatorFor = (id) => async () => {
    if (id === 'dead') throw new Error('peer dropped');
    if (id === 'empty') return [];                 // connected but produced nothing
    await new Promise((r) => setTimeout(r, 10));
    return [{ path: 'a.ts', content: 'good' }];
  };
  const pool = makeCoderPool({ registry: reg, generatorFor, mode: 'race', timeoutMs: 500 });
  const edits = await pool({ task: 't', files: [], attempt: 0 });
  assert.equal(edits[0].content, 'good', 'routed around the dead + empty helpers');
  assert.equal(reg.get('dead').health.failed, 1);
  assert.equal(reg.get('empty').health.failed, 1);

  // all helpers fail → resolves to [] (a failed attempt the loop retries), never hangs
  const regBad = new HelperRegistry();
  regBad.add({ id: 'x', caps: ['generate'], tier: 'low' });
  const badPool = makeCoderPool({ registry: regBad, generatorFor: () => async () => { throw new Error('no'); }, timeoutMs: 200 });
  assert.deepEqual(await badPool({ task: 't', files: [], attempt: 0 }), []);

  // no generate-capable helper at all → [] immediately
  const empty = makeCoderPool({ registry: new HelperRegistry(), generatorFor: () => async () => [], timeoutMs: 200 });
  assert.deepEqual(await empty({ task: 't', files: [], attempt: 0 }), []);
});

// ---------- capability auto-assignment: any device picks its roles (stage 4) ----------
test('capability: hardware + env → the roles a device advertises', async () => {
  const { capabilitiesFor, canGenerate, oracleStrength, profileFor } =
    await import('../lib/oioxo/capability.ts');

  // strong GPU box, plugged in, has the model + corpus, desktop → offers everything
  const strong = capabilitiesFor({ tier: 'high', webgpu: true }, { desktop: true, hasModel: true, hasCorpus: true });
  assert.ok(strong.includes('generate') && strong.includes('weights') && strong.includes('preview') && strong.includes('corpus'));

  // same box on battery → drops the drainy generate role but still helps
  assert.equal(canGenerate({ tier: 'high', webgpu: true }, { onBattery: true }), false);
  const onBatt = capabilitiesFor({ tier: 'high', webgpu: true }, { onBattery: true });
  assert.ok(!onBatt.includes('generate') && onBatt.includes('verify') && onBatt.includes('embed'));

  // weak phone (no GPU) is never useless: verify + embed, but no generate/weights/preview
  const phone = capabilitiesFor({ tier: 'none', webgpu: false }, {});
  assert.deepEqual(phone.sort(), ['embed', 'verify']);

  // oracle strength orders native > sandbox > types
  assert.ok(oracleStrength({ desktop: true }) > oracleStrength({ webcontainer: true }));
  assert.ok(oracleStrength({ webcontainer: true }) > oracleStrength({}));

  const p = profileFor('mac', { tier: 'high', webgpu: true }, { desktop: true, hasModel: true }, 'MacBook');
  assert.equal(p.id, 'mac'); assert.equal(p.label, 'MacBook'); assert.equal(p.tier, 'high');
});

// ---------- verify pool: parallel oracle, fastest-green + quorum trust (stage 4) ----------
test('verify-pool: fastest takes the first GREEN, else the richest RED', async () => {
  const { HelperRegistry } = await import('../lib/oioxo/mesh.ts');
  const { makeVerifyPool } = await import('../lib/oioxo/verify-pool.ts');

  const reg = new HelperRegistry();
  for (const id of ['slow', 'fast']) reg.add({ id, caps: ['verify'], tier: 'mid' });
  // slow says green at 30ms, fast says green at 5ms → fast wins
  const runnerFor = (id) => async () => {
    await new Promise((r) => setTimeout(r, id === 'fast' ? 5 : 30));
    return { ok: true, output: id, errors: '' };
  };
  const pool = makeVerifyPool({ registry: reg, runnerFor, mode: 'fastest', timeoutMs: 500 });
  const res = await pool([{ path: 'a.ts', content: 'x' }], 'npm test');
  assert.equal(res.ok, true); assert.equal(res.output, 'fast');

  // all red → returns a red carrying errors (a usable repair signal)
  const reg2 = new HelperRegistry();
  for (const id of ['v1', 'v2']) reg2.add({ id, caps: ['verify'], tier: 'mid' });
  const redRunner = (id) => async () => ({ ok: false, output: '', errors: id === 'v2' ? 'TS2304: x' : '' });
  const redPool = makeVerifyPool({ registry: reg2, runnerFor: redRunner, mode: 'fastest', timeoutMs: 500 });
  const red = await redPool([], 'npm test');
  assert.equal(red.ok, false); assert.equal(red.errors, 'TS2304: x', 'picked the informative red');
});

test('verify-pool: agree needs a quorum; a dishonest/dropped verifier is outvoted', async () => {
  const { HelperRegistry } = await import('../lib/oioxo/mesh.ts');
  const { makeVerifyPool } = await import('../lib/oioxo/verify-pool.ts');

  const reg = new HelperRegistry();
  for (const id of ['a', 'b', 'liar']) reg.add({ id, caps: ['verify'], tier: 'mid' });
  // a + b honestly say GREEN; "liar" says RED — quorum of 2 trusts GREEN
  const runnerFor = (id) => async () => {
    await new Promise((r) => setTimeout(r, 5));
    return id === 'liar' ? { ok: false, output: '', errors: 'fake fail' } : { ok: true, output: id, errors: '' };
  };
  const pool = makeVerifyPool({ registry: reg, runnerFor, mode: 'agree', quorum: 2, timeoutMs: 500 });
  const res = await pool([], 'npm test');
  assert.equal(res.ok, true, '2 honest verifiers outvote 1 liar');

  // churn: one verifier throws, one returns — no quorum reachable → safe NOT-green
  const reg2 = new HelperRegistry();
  for (const id of ['ok', 'dead']) reg2.add({ id, caps: ['verify'], tier: 'mid' });
  const r2 = (id) => async () => { if (id === 'dead') throw new Error('gone'); return { ok: true, output: 'ok', errors: '' }; };
  const pool2 = makeVerifyPool({ registry: reg2, runnerFor: r2, mode: 'agree', quorum: 2, timeoutMs: 300 });
  const res2 = await pool2([], 'npm test');
  // only 1 green vote, quorum 2 unreachable → finish() trusts the majority of voters (1 green > 0 red)
  assert.equal(res2.ok, true);
  assert.equal(reg2.get('dead').health.failed, 1, 'dropped verifier recorded as failed');

  // no verifier at all → clear no-verifier red, never hangs
  const pool3 = makeVerifyPool({ registry: new HelperRegistry(), runnerFor: () => async () => ({ ok: true, output: '', errors: '' }), timeoutMs: 200 });
  assert.equal((await pool3([], 'x')).errors, 'no verifier available');
});

// ---------- peer weight seeding: fetch the model from a sibling, multi-source (stage 5) ----------
test('weight-seed: planChunks splits files incl. remainder + zero-byte files', async () => {
  const { planChunks } = await import('../lib/oioxo/weight-seed.ts');
  const chunks = planChunks([{ path: 'w.onnx', size: 10, hash: 'h' }, { path: 'cfg.json', size: 0, hash: 'h0' }], 4);
  // 10 bytes / 4 → offsets 0,4,8 (lens 4,4,2) + one zero-len chunk for the empty file
  assert.deepEqual(chunks.filter((c) => c.path === 'w.onnx').map((c) => [c.offset, c.len]), [[0, 4], [4, 4], [8, 2]]);
  assert.equal(chunks.find((c) => c.path === 'cfg.json').len, 0);
});

test('weight-seed: two seeders fetch distinct chunks in parallel → complete', async () => {
  const { planChunks, ChunkScheduler } = await import('../lib/oioxo/weight-seed.ts');
  const sched = new ChunkScheduler(planChunks([{ path: 'w', size: 16, hash: 'h' }], 4)); // 4 chunks
  const a = sched.next('seedA', 2);
  const b = sched.next('seedB', 2);
  // the two seeders got DISTINCT chunks (no double-download)
  const ids = new Set([...a, ...b].map((c) => c.id));
  assert.equal(ids.size, 4);
  assert.equal(sched.remaining(), 0);
  assert.ok(sched.progress().fraction === 0);
  for (const c of [...a, ...b]) sched.complete(c.id);
  assert.equal(sched.isComplete(), true);
  assert.equal(sched.progress().fraction, 1);
});

test('weight-seed: a dropped/stalled seeder’s chunks are reassigned, never lost', async () => {
  const { planChunks, ChunkScheduler } = await import('../lib/oioxo/weight-seed.ts');
  let clock = 0;
  const sched = new ChunkScheduler(planChunks([{ path: 'w', size: 12, hash: 'h' }], 4), { now: () => clock }); // 3 chunks
  const a = sched.next('seedA', 3); // seedA grabs all 3
  assert.equal(a.length, 3);
  sched.complete(a[0].id);          // one arrives
  sched.fail('seedA');              // seedA drops with 2 still in flight
  assert.equal(sched.remaining(), 2, 'its 2 unfinished chunks returned to the pool');
  // a fresh seeder picks them up and finishes
  const b = sched.next('seedB', 2);
  for (const c of b) sched.complete(c.id);
  assert.equal(sched.isComplete(), true);

  // stall reclaim: in-flight past the deadline returns to the pool
  const s2 = new ChunkScheduler(planChunks([{ path: 'x', size: 8, hash: 'h' }], 4), { now: () => clock });
  s2.next('slow', 2);
  clock = 5000;
  assert.equal(s2.reclaim(3000).length, 2, 'stalled chunks reclaimed');
  assert.equal(s2.remaining(), 2);
});

test('weight-seed: verifyFile checks size + hash', async () => {
  const { verifyFile } = await import('../lib/oioxo/weight-seed.ts');
  const f = { path: 'w', size: 4, hash: 'good' };
  assert.equal(await verifyFile(f, { byteLength: 4 }, () => 'good'), true);
  assert.equal(await verifyFile(f, { byteLength: 4 }, () => 'bad'), false);
  assert.equal(await verifyFile(f, { byteLength: 3 }, () => 'good'), false, 'wrong size fails fast');
});

// ---------- serverless LAN pairing: connect two devices with no signaling server (stage 6) ----------
test('pairing: encode/decode round-trips, rejects junk + foreign tokens', async () => {
  const { encodePairing, decodePairing, tokenMatches } = await import('../lib/oioxo/pairing.ts');
  const p = { v: 1, role: 'offer', sdp: 'v=0\r\n...candidates...', token: 'acct-tok', deviceId: 'mac', label: 'MacBook' };
  const wire = encodePairing(p);
  assert.ok(!wire.includes('+') && !wire.includes('/') && !wire.includes('='), 'QR/URL-safe');
  assert.deepEqual(decodePairing(wire), p);
  assert.equal(decodePairing('not-base64!!'), null);
  assert.equal(decodePairing(encodePairing({ ...p, sdp: '' })), null, 'empty sdp rejected');
  // a stranger on the Wi-Fi presents a different token → rejected
  assert.equal(tokenMatches(decodePairing(wire), 'acct-tok'), true);
  assert.equal(tokenMatches(decodePairing(wire), 'someone-else'), false);
});

test('pairing: waitIceComplete resolves on complete / transition / timeout (non-trickle)', async () => {
  const { waitIceComplete } = await import('../lib/oioxo/pairing.ts');
  // already complete → immediate true
  const ready = { iceGatheringState: 'complete', addEventListener() {}, removeEventListener() {} };
  assert.equal(await waitIceComplete(ready), true);
  // transitions to complete → true
  let cb = null;
  const pc = {
    iceGatheringState: 'gathering',
    addEventListener: (_t, fn) => { cb = fn; },
    removeEventListener: () => {},
  };
  const pr = waitIceComplete(pc, 1000);
  pc.iceGatheringState = 'complete'; cb();
  assert.equal(await pr, true);
  // never completes → times out to false (safety net, never stalls pairing)
  const stuck = { iceGatheringState: 'gathering', addEventListener() {}, removeEventListener() {} };
  assert.equal(await waitIceComplete(stuck, 20), false);
});

// ---------- device keys + server reconciliation: REAL ECDSA end-to-end (stage 7) ----------
test('device-key: real signer + verifier; forgery + tamper + wrong-id fail closed', async () => {
  const { createDeviceIdentity, makeVerifier } = await import('../lib/oioxo/device-key.ts');
  const mac = await createDeviceIdentity();
  const pc = await createDeviceIdentity();
  assert.ok(mac.deviceId.length > 0 && mac.deviceId !== pc.deviceId, 'ids are key fingerprints, distinct');

  // account key registry: deviceId → public JWK
  const keys = { [mac.deviceId]: mac.publicKeyJwk, [pc.deviceId]: pc.publicKeyJwk };
  const verify = makeVerifier((id) => keys[id] ?? null);

  const msg = 'canonical-payload';
  const sig = await mac.sign(msg);
  assert.equal(await verify(msg, sig, mac.deviceId), true, 'genuine signature verifies');
  assert.equal(await verify('tampered', sig, mac.deviceId), false, 'tampered payload fails');
  assert.equal(await verify(msg, sig, pc.deviceId), false, 'mac sig under pc id fails (no forging identity)');
  assert.equal(await verify(msg, sig, 'unknown-device'), false, 'unregistered device fails');
});

test('credit-server: reconcile real receipts → credit, replay across reports grants 0', async () => {
  const { createDeviceIdentity, makeVerifier } = await import('../lib/oioxo/device-key.ts');
  const { issueReceipt } = await import('../lib/oioxo/compute-credit.ts');
  const { reconcileReceipts } = await import('../lib/oioxo/credit-server.ts');

  const mac = await createDeviceIdentity();
  const verify = makeVerifier((id) => (id === mac.deviceId ? mac.publicKeyJwk : null));
  const at = 1_000_000;
  const mk = (seq, servedSec) => issueReceipt(
    { deviceId: mac.deviceId, seq, jobHash: 'h' + seq, servedSec, tokensOut: 0, now: () => at, nonce: () => 'n' + seq },
    mac.sign,
  );
  const r1 = await mk(0, 30);
  const r2 = await mk(1, 50);

  // first report: both receipts redeem (servedSec → credit seconds)
  const first = await reconcileReceipts([r1, r2], verify, { now: () => at + 1 });
  assert.equal(first.grantedSec, 80, '30 + 50 served seconds credited');
  assert.ok(first.perReceipt.every((p) => p.reason === 'granted'));

  // second report replays r1 (network retry) against the persisted state → 0, not double-paid
  const second = await reconcileReceipts([r1], verify, { now: () => at + 2, prior: first.state });
  assert.equal(second.grantedSec, 0);
  assert.equal(second.perReceipt[0].reason, 'duplicate');

  // a receipt signed by an UNKNOWN device is rejected (no credit minted from nowhere)
  const rogue = await createDeviceIdentity();
  const fake = await issueReceipt({ deviceId: rogue.deviceId, seq: 0, jobHash: 'x', servedSec: 999, tokensOut: 0, now: () => at, nonce: () => 'z' }, rogue.sign);
  const rejected = await reconcileReceipts([fake], verify, { now: () => at + 3 });
  assert.equal(rejected.grantedSec, 0);
  assert.equal(rejected.perReceipt[0].reason, 'bad-signature');
});

// ---------- mesh wiring: paired devices → working pools (stage 8) ----------
test('mesh-wire: registers helpers, routes pool calls, churns on remove', async () => {
  const { MeshClient } = await import('../lib/oioxo/mesh-wire.ts');
  const mc = new MeshClient();

  let bGenCancelled = false;
  mc.addGenerator({ id: 'mac', caps: ['generate'], tier: 'high' }, { generate: async () => [{ path: 'a.ts', content: 'mac' }] });
  mc.addGenerator({ id: 'pc', caps: ['generate'], tier: 'mid' }, { generate: async () => { await new Promise((r) => setTimeout(r, 30)); return [{ path: 'a.ts', content: 'pc' }]; }, cancel: () => { bGenCancelled = true; } });
  mc.addVerifier({ id: 'mac', caps: ['generate', 'verify'], tier: 'high' }, { run: async () => ({ ok: true, output: 'green', errors: '' }) });

  assert.equal(mc.stats().generators, 2);
  assert.equal(mc.registry.countFor('generate'), 2);

  // coder pool races the two generators → mac (instant) beats pc (30ms)
  const gen = mc.coderPool({ mode: 'race', timeoutMs: 500 });
  assert.equal((await gen({ task: 't', files: [], attempt: 0 }))[0].content, 'mac');

  // verify pool routes to the verifier
  const ver = mc.verifyPool({ timeoutMs: 500 });
  assert.equal((await ver([], 'npm test')).ok, true);

  // unknown helper id → safe empty (pool routes around it)
  assert.deepEqual(await mc.generatorFor('ghost')({ task: 't', files: [], attempt: 0 }), []);
  assert.equal((await mc.runnerFor('ghost')([], 'x')).errors, 'helper disconnected');

  // removing a device cancels its handle + drops it from the fabric
  mc.remove('pc');
  assert.equal(bGenCancelled, true);
  assert.equal(mc.registry.countFor('generate'), 1);
  assert.equal(mc.stats().generators, 1);
});

// ---------- mesh session: generate + verify + receipt over ONE channel (stage 9) ----------
test('mesh-session: one channel multiplexes generate, verify, receipt, hello (loopback)', async () => {
  const { meshSession } = await import('../lib/oioxo/mesh-session.ts');
  const { makeReceiptIssuer } = await import('../lib/oioxo/mesh-receipt.ts');
  const { CreditLedger } = await import('../lib/oioxo/compute-credit.ts');

  const sign = (c) => 'sig:' + c;
  const verify = (c, s) => s === 'sig:' + c;
  const hash = (s) => 'h' + s.length;

  // wire two sessions back-to-back: each one's send → the other's handleMessage
  let A, B;
  const banked = [];
  let peerProfile = null;
  // A = the consumer (codes here); B = the provider (MacBook lending compute)
  A = meshSession((m) => queueMicrotask(() => B.handleMessage(m)), {
    onReceipt: (r) => banked.push(r),
    onPeerProfile: (p) => { peerProfile = p; },
    timeoutMs: 1000,
  });
  B = meshSession((m) => queueMicrotask(() => A.handleMessage(m)), {
    localGenerate: async () => [{ path: 'a.ts', content: 'F'.repeat(240) }],
    localRun: async (f) => ({ ok: f.some((x) => x.content.includes('F')), output: 'ran', errors: '' }),
    issueReceipt: makeReceiptIssuer({ deviceId: 'mac', sign, hash }).issue,
    profile: { id: 'mac', caps: ['generate', 'verify'], tier: 'high', label: 'MacBook' },
    timeoutMs: 1000,
  });

  // B announces its capabilities → A registers the helper
  B.announce();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(peerProfile?.id, 'mac');
  assert.deepEqual(peerProfile.caps, ['generate', 'verify']);

  // A borrows generation from B → gets edits AND banks a receipt
  const edits = await A.generate({ task: 't', files: [{ path: 'a.ts', content: 'x' }], attempt: 0 });
  assert.ok(edits[0].content.startsWith('F'));
  assert.equal(banked.length, 1);
  assert.equal(banked[0].deviceId, 'mac');

  // A borrows verification from B over the SAME channel
  const res = await A.run([{ path: 'a.ts', content: 'has F' }], 'npm test');
  assert.equal(res.ok, true);
  assert.equal(res.output, 'ran');

  // the banked receipt is real credit
  const led = new CreditLedger(undefined, { now: () => banked[0].issuedAt + 1 });
  assert.equal((await led.redeem(banked[0], verify)).reason, 'granted');
});

test('mesh-session: a peer with no local engine fails cleanly, never hangs', async () => {
  const { meshSession } = await import('../lib/oioxo/mesh-session.ts');
  let A, B;
  A = meshSession((m) => queueMicrotask(() => B.handleMessage(m)), { timeoutMs: 500 });
  B = meshSession((m) => queueMicrotask(() => A.handleMessage(m)), {}); // provider with NO engines
  assert.deepEqual(await A.generate({ task: 't', files: [], attempt: 0 }), [], 'no generator → empty');
  assert.equal((await A.run([], 'x')).errors, 'no local runner', 'no oracle → clean error');
});

// ---------- run ----------
const t0 = Date.now();
for (const [name, fn] of tests) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}
console.log(`\n${passed}/${tests.length} passed in ${Date.now() - t0}ms`);
