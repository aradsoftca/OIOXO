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

// ---------- run ----------
const t0 = Date.now();
for (const [name, fn] of tests) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}
console.log(`\n${passed}/${tests.length} passed in ${Date.now() - t0}ms`);
