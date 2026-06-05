'use client';
/**
 * oioxo Code — the "share my blocks / got a code?" surface (weak-device magic,
 * lever 4 UI). Pools the verified-brick corpus device-to-device over the same P2P
 * channel as project sharing. All logic lives in the tested pure modules
 * (brick-share + brick-store.importSharedBricks); this is just the wiring + markup,
 * mirroring the project SharePopover.
 *
 * Trust note surfaced to the user: imported blocks are RE-PROVEN by this device's
 * own oracle before any are kept — the panel shows "added N, skipped M" so the
 * trust-nothing gate is visible, not hidden.
 */
import React from 'react';
import { Boxes, Share2, X, Copy, Check, Loader2, ArrowDownToLine } from 'lucide-react';
import { sendBricks, receiveBricks } from '@/lib/oioxo/brick-share';
import { getShareableBricks, importSharedBricks } from '@/lib/oioxo/brick-store';
import { loadTsLibs } from '@/lib/oioxo/tslibs';
import type { PeerState } from '@/lib/p2p/peer';

type ImportResult = { added: number; accepted: number; rejected: number; rejections: { title: string; reason: string }[] };

export function BrickShare() {
  const [mode, setMode] = React.useState<null | 'share' | 'import'>(null);
  const [share, setShare] = React.useState<null | { room: string; state: PeerState; sent: number; total: number }>(null);
  const [code, setCode] = React.useState('');
  const [recv, setRecv] = React.useState<null | { state: PeerState; received: number; total: number; result?: ImportResult; error?: string }>(null);
  const [copied, setCopied] = React.useState(false);
  const sendRef = React.useRef<{ cancel(): void } | null>(null);
  const recvRef = React.useRef<{ cancel(): void } | null>(null);

  const close = () => {
    sendRef.current?.cancel(); sendRef.current = null;
    recvRef.current?.cancel(); recvRef.current = null;
    setMode(null); setShare(null); setRecv(null); setCode('');
  };

  async function startShare() {
    setMode('share');
    const bricks = await getShareableBricks().catch(() => []);
    if (!bricks.length) { setShare({ room: '', state: 'failed', sent: 0, total: 0 }); return; }
    const handle = sendBricks(bricks, {
      onState: (state) => setShare((s) => (s ? { ...s, state } : s)),
      onProgress: (sent, total) => setShare((s) => (s ? { ...s, sent, total } : s)),
    });
    sendRef.current = handle;
    setShare({ room: handle.room, state: 'connecting', sent: 0, total: bricks.length });
  }

  function startImport() {
    const c = code.trim();
    if (!c) return;
    setRecv({ state: 'connecting', received: 0, total: 0 });
    const handle = receiveBricks(c, {
      onState: (state) => setRecv((r) => (r ? { ...r, state } : r)),
      onProgress: (received, total) => setRecv((r) => (r ? { ...r, received, total } : r)),
      onComplete: async (bricks) => {
        try {
          const libs = await loadTsLibs().catch(() => undefined);
          const result = await importSharedBricks(bricks, libs); // RE-PROVES locally
          setRecv((r) => (r ? { ...r, result } : { state: 'connected', received: bricks.length, total: bricks.length, result }));
        } catch (e) {
          setRecv((r) => (r ? { ...r, error: e instanceof Error ? e.message : 'import failed' } : r));
        }
      },
    });
    recvRef.current = handle;
  }

  const copy = async () => {
    if (!share?.room) return;
    try { await navigator.clipboard.writeText(share.room); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setMode('import')}
        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] font-semibold text-zinc-500 hover:bg-zinc-50"
      >
        <Boxes className="h-3.5 w-3.5" /> Share / import blocks…
      </button>

      {mode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={close}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-zinc-900">
                <Boxes className="h-4 w-4" /> Verified blocks
              </h3>
              <button type="button" onClick={close} className="text-zinc-400 hover:text-zinc-700"><X className="h-4 w-4" /></button>
            </div>

            {/* mode switch */}
            <div className="mb-4 flex gap-1 rounded-lg bg-zinc-100 p-0.5 text-[12px] font-semibold">
              <button type="button" onClick={() => { setRecv(null); startShare(); }}
                className={['flex-1 rounded-md px-2 py-1', mode === 'share' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'].join(' ')}>
                Share mine
              </button>
              <button type="button" onClick={() => { setShare(null); setMode('import'); }}
                className={['flex-1 rounded-md px-2 py-1', mode === 'import' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'].join(' ')}>
                Got a code?
              </button>
            </div>

            {mode === 'share' && (
              <div className="space-y-3">
                {share?.state === 'failed' && !share.room ? (
                  <p className="text-[12px] text-amber-600">No verified blocks to share yet — build something first and they’ll be harvested automatically.</p>
                ) : (
                  <>
                    <p className="text-[12px] text-zinc-500">Give this code to a peer. Your proven blocks transfer device-to-device — they’re re-checked on their side before use.</p>
                    <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                      <code className="flex-1 select-all text-center text-lg font-bold tracking-[0.3em] text-zinc-900">{share?.room || '…'}</code>
                      <button type="button" onClick={copy} className="flex items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-zinc-700">
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 text-[12px] text-zinc-600">
                      {share?.state === 'connected'
                        ? (share.sent >= share.total
                            ? <><Check className="h-3.5 w-3.5 text-green-600" /> Sent {share.total} blocks.</>
                            : <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending {share.sent}/{share.total}…</>)
                        : <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for a peer to connect…</>}
                    </div>
                  </>
                )}
              </div>
            )}

            {mode === 'import' && (
              <div className="space-y-3">
                {!recv ? (
                  <>
                    <p className="text-[12px] text-zinc-500">Paste a code to pull a peer’s verified blocks. Each is re-proven on your device before it’s kept.</p>
                    <div className="flex gap-2">
                      <input
                        value={code} onChange={(e) => setCode(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') startImport(); }}
                        placeholder="paste a code"
                        className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-[13px] outline-none focus:border-zinc-400"
                      />
                      <button type="button" onClick={startImport} disabled={!code.trim()}
                        className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-2 text-[12px] font-semibold text-white hover:bg-zinc-700 disabled:opacity-40">
                        <ArrowDownToLine className="h-3.5 w-3.5" /> Get
                      </button>
                    </div>
                  </>
                ) : recv.error ? (
                  <p className="text-[12px] text-rose-600">{recv.error}</p>
                ) : recv.result ? (
                  <div className="space-y-1.5 text-[12px]">
                    <p className="flex items-center gap-1.5 font-semibold text-green-700">
                      <Check className="h-3.5 w-3.5" /> Added {recv.result.added} verified block{recv.result.added === 1 ? '' : 's'}
                      {recv.result.rejected > 0 && <span className="font-normal text-zinc-500"> · skipped {recv.result.rejected}</span>}
                    </p>
                    {recv.result.rejections.slice(0, 4).map((r, i) => (
                      <p key={i} className="text-[11px] text-zinc-400">✗ {r.title}: {r.reason}</p>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[12px] text-zinc-600">
                    {recv.state === 'failed'
                      ? <span className="text-amber-600">Couldn’t connect. Check the code and that the sender is still open.</span>
                      : <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {recv.total ? `Receiving ${recv.received}/${recv.total}…` : 'Connecting…'}</>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
