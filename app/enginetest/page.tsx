'use client';
// DEV-ONLY in-browser test harness for the oioxo engine. Lets a headless browser
// exercise respond() in a REAL browser context (so the Translator API + Bergamot
// actually run, unlike Node). Load /_enginetest?q=<prompt> and read #result.
// Not linked anywhere; scratch tooling for the relentless test-fix loop.
import { useEffect, useState } from 'react';
import { respond } from '@/lib/ai/oioxo-engine';

export default function EngineTest() {
  const [out, setOut] = useState('PENDING');
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('q') || '';
    const t0 = Date.now();
    respond(q, {})
      .then((r) => setOut(JSON.stringify({
        q,
        ms: Date.now() - t0,
        text: r.text || '',
        sources: (r.sources || []).map((s) => s.site),
      })))
      .catch((e) => setOut('ERR: ' + (e?.message || String(e))));
  }, []);
  return <pre id="result" data-done={out !== 'PENDING' ? '1' : '0'} style={{ whiteSpace: 'pre-wrap', padding: 16 }}>{out}</pre>;
}
