'use client';
/**
 * oioxo — in-browser SELF-TEST. The Node suite proves the pure cores; this proves
 * the BROWSER-ONLY path that Node can't, on the live deployed site:
 *  - fast checks (auto): cross-origin isolation, IndexedDB corpus, the trust-nothing
 *    import gate (real type oracle), live check evaluation, patch apply
 *  - heavy button: WebContainer boots + runs Node in the browser
 *  - heavy button: the ON-DEVICE CODER (WASM tier) fixes a real bug to green
 *  - URL ?p2p=send|recv&room=CODE: real WebRTC brick transfer over /api/signal,
 *    so two browser tabs prove P2P + the import gate device-to-device.
 * Open https://oioxo.com/oioxo/selftest — green/red in one click.
 */
import React from 'react';

type Result = { name: string; ok: boolean; detail: string; ms: number };

async function timed(name: string, fn: () => Promise<string>): Promise<Result> {
  const t = Date.now();
  try { const detail = await fn(); return { name, ok: true, detail, ms: Date.now() - t }; }
  catch (e) { return { name, ok: false, detail: (e as Error)?.message || String(e), ms: Date.now() - t }; }
}

function evalChecksInIframe(body: string, setup: string, srcs: string[]): Promise<boolean[]> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-9999px;width:600px;height:400px';
    iframe.srcdoc = `<!doctype html><html><body>${body}<script>window.__oioxoListeners=[];window.__oioxoFrames=0;window.__oioxoCanvasPainted=false;${setup}</script></body></html>`;
    const to = setTimeout(() => { try { iframe.remove(); } catch { /* */ } reject(new Error('iframe load timeout')); }, 4000);
    iframe.onload = () => {
      try {
        const w = iframe.contentWindow as unknown as { eval: (s: string) => unknown };
        const out = srcs.map((s) => { try { return !!w.eval(s); } catch { return false; } });
        clearTimeout(to); iframe.remove(); resolve(out);
      } catch (e) { clearTimeout(to); try { iframe.remove(); } catch { /* */ } reject(e as Error); }
    };
    document.body.appendChild(iframe);
  });
}

const FAST_TESTS: { name: string; run: () => Promise<string> }[] = [
  {
    name: 'Cross-origin isolated (WebContainer/SharedArrayBuffer prerequisite)',
    run: async () => {
      if (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated) return 'crossOriginIsolated = true';
      throw new Error('NOT cross-origin isolated');
    },
  },
  {
    name: 'Gem cores present in the deployed bundle',
    run: async () => {
      const { SEED_BRICKS, matchBricks } = await import('@/lib/oioxo/bricks');
      const { deriveChecks } = await import('@/lib/oioxo/checks');
      const { parseJsonEdits } = await import('@/lib/oioxo/patch');
      if (!/debounce/i.test(matchBricks('a debounce helper', SEED_BRICKS)[0]?.title || '')) throw new Error('brick retrieval missing');
      if (!deriveChecks('a counter button').some((c) => /button/i.test(c.name))) throw new Error('deriveChecks missing');
      if (!parseJsonEdits('{"edits":[{"find":"a","replace":"b"}]}', 'x.ts').length) throw new Error('json edit parse missing');
      return `bricks(${SEED_BRICKS.length}) + checks + json-edits OK`;
    },
  },
  {
    name: 'IndexedDB brick corpus (store + retrieve)',
    run: async () => {
      const { addBricks, recallBricks, clearBricks } = await import('@/lib/oioxo/brick-store');
      const { SEED_BRICKS } = await import('@/lib/oioxo/bricks');
      await clearBricks();
      const added = await addBricks(SEED_BRICKS);
      if (!/debounce/i.test(await recallBricks('a debounce helper'))) throw new Error('recall failed');
      return `stored ${added} bricks; recall returned the right block`;
    },
  },
  {
    name: 'P2P import gate — TRUST NOTHING (real type oracle)',
    run: async () => {
      const { importSharedBricks } = await import('@/lib/oioxo/brick-store');
      const { loadTsLibs } = await import('@/lib/oioxo/tslibs');
      const libs = await loadTsLibs().catch(() => undefined);
      const incoming = [
        { id: 'a', title: 'add', kind: 'util', tags: ['add'], lang: 'ts', origin: 'seed', verified: true, ts: 0, code: 'export const add = (a: number, b: number): number => a + b;\n' },
        { id: 'evil', title: 'evil', kind: 'util', tags: ['x'], lang: 'ts', origin: 'seed', verified: true, ts: 0, code: 'export const n: number = "not a number";\n' },
      ];
      // @ts-expect-error wire shape
      const r = await importSharedBricks(incoming, libs);
      if (r.accepted < 1) throw new Error('rejected a VALID brick (TS libs missing?)');
      if (r.rejected < 1) throw new Error('ACCEPTED a malicious brick — gate failed!');
      return `re-proved locally: accepted ${r.accepted}, rejected ${r.rejected}`;
    },
  },
  {
    name: 'Behavioral checks discriminate in a real iframe',
    run: async () => {
      const { deriveChecks } = await import('@/lib/oioxo/checks');
      const srcs = deriveChecks('a button that increments a counter').map((c) => c.src);
      const good = await evalChecksInIframe('<button id="b">+1</button> <span id="s">0</span>', "document.getElementById('b').addEventListener('click',function(){});window.__oioxoListeners.push('click');", srcs);
      const ph = await evalChecksInIframe('<h1>Counter</h1><p>coming soon</p>', '', srcs);
      if (good.filter(Boolean).length !== srcs.length) throw new Error('a correct build failed a check');
      if (ph.filter((x) => !x).length < 1) throw new Error('placeholder passed every check');
      return `good ${good.filter(Boolean).length}/${srcs.length} · placeholder fails ${ph.filter((x) => !x).length}`;
    },
  },
  {
    name: 'Server-free static oracle (verify a build with NO WebContainer)',
    run: async () => {
      const { makeStaticPreviewRun } = await import('@/lib/oioxo/preview-oracle');
      const run = makeStaticPreviewRun(() => [{ name: 'has a button', src: "!!document.querySelector('button')" }]);
      const good = await run([{ path: 'index.html', content: '<!doctype html><html><body><button id="b">Go</button></body></html>' }], 'static');
      const bad = await run([{ path: 'index.html', content: '<!doctype html><html><body><p>coming soon</p></body></html>' }], 'static');
      if (!good.ok) throw new Error('a real button page failed the server-free oracle: ' + good.errors.slice(0, 80));
      if (bad.ok) throw new Error('a placeholder passed — the oracle gave no signal');
      return 'verified good vs placeholder via srcdoc — no WebContainer booted';
    },
  },
  {
    name: 'Project history (never lose work — snapshot + roll back, IndexedDB)',
    run: async () => {
      const { recordSnapshot, loadHistory, lastGreen, clearHistory } = await import('@/lib/oioxo/history');
      const pid = 'selftest-' + Date.now();
      await clearHistory(pid);
      await recordSnapshot(pid, 'scaffold', 'start', [{ path: 'a.js', content: 'v0' }]);
      await recordSnapshot(pid, 'green', 'works', [{ path: 'a.js', content: 'v1' }]);
      await recordSnapshot(pid, 'edit', 'wip', [{ path: 'a.js', content: 'v2-broken' }]);
      const tl = await loadHistory(pid);
      const green = lastGreen(tl);
      await clearHistory(pid);
      if (tl.length < 3) throw new Error('timeline did not persist: ' + tl.length);
      if (green?.files[0].content !== 'v1') throw new Error('cannot roll back to the last working version');
      return `persisted ${tl.length} versions; rolled back to last green ("${green.label}")`;
    },
  },
  {
    name: 'Hard unlock gate (ECDHE + device-bound entitlement) on the live server',
    run: async () => {
      const { requestUnlock } = await import('@/lib/oioxo/unlock');
      const { decodeClaims, newDeviceId } = await import('@/lib/oioxo/entitlement');
      // deny path: a bogus (unsigned) entitlement must be REJECTED with 403
      const deny = await fetch('/api/code-key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entitlement: 'aaa.bbb', device: 'x', assetId: 't', clientPubB64: 'AAAA' }) });
      if (deny.status !== 403) throw new Error('gate did NOT reject a forged entitlement (status ' + deny.status + ')');
      // grant path: a real device-bound entitlement → full ECDHE handshake → key
      const device = newDeviceId();
      const er = await fetch('/api/entitlement', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device }) });
      if (!er.ok) throw new Error('entitlement issuance failed (' + er.status + ')');
      const { entitlement } = (await er.json()) as { entitlement: string };
      const claims = decodeClaims(entitlement);
      if (!claims) throw new Error('no entitlement claims');
      const key = await requestUnlock('/api/code-key', { entitlement, sub: claims.sub, device, assetId: 'selftest' });
      if (!(key instanceof Uint8Array) || key.length !== 32) throw new Error('handshake did not yield a 32-byte key');
      return 'forged → 403; real entitlement → ECDHE handshake recovered a 32-byte key';
    },
  },
  {
    name: 'Patch apply (diff-not-rewrite)',
    run: async () => {
      const { applyPatchReply } = await import('@/lib/oioxo/patch');
      const r = applyPatchReply('{"edits":[{"find":"ms: string","replace":"ms: number"}]}', [{ path: 'u.ts', content: 'let ms: string = 0;\n' }], 'u.ts');
      if (!r.edits[0]?.content.includes('ms: number')) throw new Error('patch did not apply');
      return 'JSON edit located + applied';
    },
  },
];

/* ── P2P mode (driven by ?p2p=send|recv&room=CODE) — real WebRTC over /api/signal ── */
const TEST_BRICKS = [
  { id: 's', title: 'sum', kind: 'util', tags: ['sum'], lang: 'ts', origin: 'user', verified: true, ts: 0, code: 'export const sum = (a: number, b: number): number => a + b;\n' },
  { id: 'bad', title: 'bad', kind: 'util', tags: ['bad'], lang: 'ts', origin: 'user', verified: true, ts: 0, code: 'export const x: number = "nope";\n' },
];

function P2PMode({ role, room }: { role: 'send' | 'recv'; room: string }) {
  const [status, setStatus] = React.useState('starting…');
  React.useEffect(() => {
    let peer: { send: (d: unknown) => void; close: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const { connectPeer } = await import('@/lib/p2p/peer');
      const { brickMessages, BrickShareReceiver } = await import('@/lib/oioxo/brick-share');
      const set = (s: string) => { if (!cancelled) { setStatus(s); (window as unknown as Record<string, unknown>).__p2presult = s; } };
      if (role === 'send') {
        peer = connectPeer('s', room, {
          onState: (st: string) => { set('state:' + st); if (st === 'connected') { for (const m of brickMessages(TEST_BRICKS as never)) peer!.send(m); set('sent ' + TEST_BRICKS.length + ' bricks'); } },
          onMessage: () => {},
        });
      } else {
        const rx = new BrickShareReceiver();
        peer = connectPeer('r', room, {
          onState: (st: string) => set('state:' + st),
          onMessage: async (m: unknown) => {
            const done = rx.accept(m as never);
            if (done) {
              const { importSharedBricks } = await import('@/lib/oioxo/brick-store');
              const { loadTsLibs } = await import('@/lib/oioxo/tslibs');
              const libs = await loadTsLibs().catch(() => undefined);
              const r = await importSharedBricks(done as never[], libs);
              set(`PASS received ${(done as unknown[]).length}, accepted ${r.accepted}, rejected ${r.rejected}`);
            }
          },
        });
      }
    })();
    return () => { cancelled = true; try { peer?.close(); } catch { /* */ } };
  }, [role, room]);
  return (
    <main style={{ maxWidth: 700, margin: '40px auto', padding: '0 20px', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>oioxo P2P self-test — {role}</h1>
      <p data-p2p-status style={{ fontSize: 14, color: '#333' }}>{status}</p>
    </main>
  );
}

export default function SelfTest() {
  const [p2p, setP2p] = React.useState<{ role: 'send' | 'recv'; room: string } | null>(null);
  const [results, setResults] = React.useState<Result[]>([]);
  const [running, setRunning] = React.useState(false);
  const [heavy, setHeavy] = React.useState<Result[]>([]);
  const [busy, setBusy] = React.useState('');

  React.useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get('p2p');
    if (r === 'send' || r === 'recv') setP2p({ role: r, room: q.get('room') || 'oioxo-selftest' });
  }, []);

  const runFast = React.useCallback(async () => {
    setRunning(true); setResults([]);
    const out: Result[] = [];
    for (const t of FAST_TESTS) { out.push(await timed(t.name, t.run)); setResults([...out]); }
    setRunning(false);
  }, []);

  React.useEffect(() => { if (!p2p) void runFast(); }, [p2p, runFast]);

  const runWebContainer = async () => {
    setBusy('wc');
    const r = await timed('In-browser Node runtime (WebContainer boots + runs)', async () => {
      const { runSupported } = await import('@/lib/oioxo/webcontainer');
      if (!runSupported()) throw new Error('not supported here');
      const { makeWebContainerRun } = await import('@/lib/oioxo/coderun');
      const res = await makeWebContainerRun()([{ path: 'index.js', content: 'console.log("oioxo:" + (6*7))' }], 'node index.js');
      if (!/oioxo:42/.test(res.output)) throw new Error('node output: ' + res.output.slice(0, 120));
      return 'booted Node in the browser and ran code → 42';
    });
    setHeavy((h) => [...h.filter((x) => !/Node runtime/.test(x.name)), r]); setBusy('');
  };

  const runCoder = async () => {
    setBusy('coder');
    const r = await timed('On-device coder (WASM tier) fixes a real bug to green', async () => {
      const { buildOrFix } = await import('@/lib/oioxo/codebuild');
      const { loadTsLibs } = await import('@/lib/oioxo/tslibs');
      const libFiles = await loadTsLibs().catch(() => undefined);
      const buggy = 'export function debounce(fn: () => void, ms: string): () => void {\n  let t: ReturnType<typeof setTimeout> | undefined;\n  return () => { if (t) clearTimeout(t); t = setTimeout(fn, ms); };\n}\n';
      const res = await buildOrFix({
        task: 'Fix the TypeScript error in u.ts. Change as little as possible.',
        files: [{ path: 'u.ts', content: buggy }],
        match: ['Qwen2.5-Coder', 'Coder', 'Qwen2.5', 'Qwen'], mode: 'typecheck', libFiles, maxIters: 4, candidates: 1, maxCandidates: 3,
      });
      if (!res.ok) throw new Error('did not reach green in ' + res.iters + ' iters' + (res.engineError ? ' (' + res.engineError.slice(0, 50) + ')' : ''));
      return 'the on-device coder fixed it to green in ' + res.iters + ' iter(s)';
    });
    setHeavy((h) => [...h.filter((x) => !/On-device coder/.test(x.name)), r]); setBusy('');
  };

  if (p2p) return <P2PMode role={p2p.role} room={p2p.room} />;

  const passed = results.filter((r) => r.ok).length;
  const row = (r: Result) => (
    <li key={r.name} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #eee', fontSize: 13 }}>
      <span style={{ color: r.ok ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{r.ok ? '✓' : '✗'}</span>
      <span style={{ flex: 1 }}><b>{r.name}</b><br /><span style={{ color: '#666' }}>{r.detail}</span></span>
      <span style={{ color: '#999' }}>{r.ms}ms</span>
    </li>
  );

  return (
    <main style={{ maxWidth: 760, margin: '40px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>oioxo — live self-test</h1>
      <p style={{ color: '#666', fontSize: 13 }}>{running ? 'Running…' : `${passed}/${results.length} fast tests passed.`}</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0' }}>{results.map(row)}</ul>
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '2px solid #eee', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => void runWebContainer()} disabled={!!busy} style={{ background: '#232327', color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>
          {busy === 'wc' ? 'Booting Node…' : 'Test in-browser Node runtime'}
        </button>
        <button onClick={() => void runCoder()} disabled={!!busy} style={{ background: '#7a5c12', color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>
          {busy === 'coder' ? 'Running on-device coder (downloads model)…' : 'Test on-device coder (heavy)'}
        </button>
      </div>
      {heavy.length > 0 && <ul style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>{heavy.map(row)}</ul>}
    </main>
  );
}
