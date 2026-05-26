'use client';
/**
 * oioxo Compute Mesh — the "lend / borrow a device" surface (stage 9 UI). Pairs two of
 * your devices on the same Wi-Fi with NO signaling server (serverless QR/paste, see
 * lib/p2p/local-peer + lib/oioxo/pairing), then runs the multiplexed session
 * (mesh-session) over that one channel. All logic lives in the tested pure modules; this
 * is wiring + markup, mirroring BrickShare.
 *
 *   • Lend this device  → this device serves generation/verification to a sibling and
 *                          mints signed receipts (you earn credit on the coding device).
 *   • Use a device       → this device borrows a sibling's compute; its profile is
 *                          registered into the MeshClient so the loop/pools can use it.
 *
 * Decoupled via props: the host (OioxoShell) supplies the account pairing `token`, this
 * device's capability `profile`, and the local engines used when LENDING. The host gets
 * the live MeshClient back via `onMeshChange` to drive its coder/verify pools.
 */
import React from 'react';
import QRCode from 'qrcode';
import { Cpu, X, Copy, Check, Loader2, QrCode, ArrowDownToLine, Zap } from 'lucide-react';
import type { GenerateFn, RunFn } from '@/lib/oioxo/codeloop';
import type { HelperProfile } from '@/lib/oioxo/mesh';
import { MeshClient } from '@/lib/oioxo/mesh-wire';
import { meshSession } from '@/lib/oioxo/mesh-session';
import { makeReceiptIssuer } from '@/lib/oioxo/mesh-receipt';
import { loadOrCreateIdentity } from '@/lib/oioxo/device-key-store';
import { startLocalPairing, joinLocalPairing } from '@/lib/p2p/local-peer';
import { toB64Url } from '@/lib/oioxo/bytes';
import type { PeerState } from '@/lib/p2p/peer';

interface MeshPanelProps {
  /** Account-bound pairing token (rejects strangers on the Wi-Fi). Empty → sign-in needed. */
  token: string;
  /** This device's advertised capabilities (from capability.profileFor). */
  profile: HelperProfile;
  /** Engines used when LENDING — the host's on-device coder/oracle. Omit → lend disabled. */
  localGenerate?: GenerateFn;
  localRun?: RunFn;
  /** The host receives the live mesh to drive its pools as helpers come and go. */
  onMeshChange?: (mesh: MeshClient) => void;
}

/** SHA-256 → base64url, for the receipt job fingerprint. */
async function sha256(s: string): Promise<string> {
  return toB64Url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}

export function MeshPanel({ token, profile, localGenerate, localRun, onMeshChange }: MeshPanelProps) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<'lend' | 'use'>('use');
  const [state, setState] = React.useState<PeerState | 'idle'>('idle');
  const [myBlob, setMyBlob] = React.useState('');   // the blob THIS device shows (QR/copy)
  const [myQr, setMyQr] = React.useState('');       // data-URL of myBlob
  const [theirBlob, setTheirBlob] = React.useState(''); // pasted from the other device
  const [peerLabel, setPeerLabel] = React.useState('');
  const [earned, setEarned] = React.useState(0);    // receipts banked while lending-consumer
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState('');

  const meshRef = React.useRef<MeshClient | null>(null);
  const peerRef = React.useRef<{ send: (m: unknown) => boolean; close: () => void } | null>(null);
  const acceptRef = React.useRef<((blob: string) => Promise<boolean>) | null>(null);
  if (!meshRef.current) meshRef.current = new MeshClient();

  const showBlob = async (blob: string) => {
    setMyBlob(blob);
    try { setMyQr(await QRCode.toDataURL(blob, { margin: 1, width: 240 })); } catch { setMyQr(''); }
  };

  const reset = () => {
    peerRef.current?.close();
    peerRef.current = null;
    acceptRef.current = null;
    setState('idle'); setMyBlob(''); setMyQr(''); setTheirBlob(''); setPeerLabel(''); setError('');
  };

  const close = () => { reset(); setOpen(false); };

  /** Register a freshly-discovered helper into the mesh + tell the host. */
  const registerHelper = (p: HelperProfile, gen: GenerateFn, run: RunFn) => {
    const mesh = meshRef.current!;
    if (p.caps.includes('generate')) mesh.addGenerator(p, { generate: gen, cancel: () => peerRef.current?.close() });
    if (p.caps.includes('verify')) mesh.addVerifier(p, { run, cancel: () => peerRef.current?.close() });
    setPeerLabel(p.label || p.id.slice(0, 6));
    onMeshChange?.(mesh);
  };

  /** USE A DEVICE — this device borrows; it is the pairing initiator (shows offer first). */
  async function startUse() {
    setMode('use'); setError(''); setState('connecting');
    const id = await loadOrCreateIdentity();
    const session = meshSession((m) => peerRef.current?.send(m), {
      onReceipt: () => setEarned((n) => n + 1),
      onPeerProfile: (p) => registerHelper(p, session.generate, session.run),
      profile,
    });
    try {
      const init = await startLocalPairing(token, id.deviceId, {
        onState: (s) => { setState(s); if (s === 'connected') session.announce(); },
        onMessage: session.handleMessage,
      }, profile.label);
      peerRef.current = init.peer;
      acceptRef.current = init.accept;
      await showBlob(await init.offer);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'pairing failed'); setState('failed');
    }
  }

  /** LEND THIS DEVICE — this device serves; it is the responder (consumes the pasted offer). */
  async function startLend(offerBlob: string) {
    if (!localGenerate && !localRun) { setError('No local engine to lend on this device.'); return; }
    setMode('lend'); setError(''); setState('connecting');
    const id = await loadOrCreateIdentity();
    const issuer = makeReceiptIssuer({ deviceId: id.deviceId, sign: id.sign, hash: sha256 });
    const session = meshSession((m) => peerRef.current?.send(m), {
      localGenerate, localRun,
      issueReceipt: issuer.issue,
      profile,
      onPeerProfile: (p) => setPeerLabel(p.label || p.id.slice(0, 6)),
    });
    try {
      const resp = await joinLocalPairing(offerBlob.trim(), token, id.deviceId, {
        onState: (s) => { setState(s); if (s === 'connected') session.announce(); },
        onMessage: session.handleMessage,
      }, profile.label);
      if (!resp) { setError('That code isn’t for this account (or is malformed).'); setState('failed'); return; }
      peerRef.current = resp.peer;
      setPeerLabel(resp.from.label || resp.from.deviceId.slice(0, 6));
      await showBlob(await resp.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'pairing failed'); setState('failed');
    }
  }

  /** Initiator finishing: paste the responder's answer to open the channel. */
  async function finishUse() {
    if (!acceptRef.current || !theirBlob.trim()) return;
    const ok = await acceptRef.current(theirBlob.trim());
    if (!ok) setError('That answer code didn’t match. Try again.');
  }

  const copy = async () => {
    if (!myBlob) return;
    try { await navigator.clipboard.writeText(myBlob); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ }
  };

  const canLend = !!(localGenerate || localRun);
  const connected = state === 'connected';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] font-semibold text-zinc-500 hover:bg-zinc-50"
      >
        <Cpu className="h-3.5 w-3.5" /> Mesh: lend / use a device…
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={close}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-zinc-900"><Cpu className="h-4 w-4" /> Compute mesh</h3>
              <button type="button" onClick={close} className="text-zinc-400 hover:text-zinc-700"><X className="h-4 w-4" /></button>
            </div>

            {!token ? (
              <p className="text-[12px] text-amber-600">Sign in to pair your devices — credit is earned per account.</p>
            ) : connected ? (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-green-700">
                  <Check className="h-4 w-4" /> Paired with {peerLabel || 'device'}
                </p>
                {mode === 'use' ? (
                  <p className="flex items-center gap-1.5 text-[12px] text-zinc-600">
                    <Zap className="h-3.5 w-3.5 text-amber-500" /> Using {meshRef.current!.stats().total} device{meshRef.current!.stats().total === 1 ? '' : 's'}
                    {earned > 0 && <span className="text-zinc-400"> · {earned} job{earned === 1 ? '' : 's'} credited</span>}
                  </p>
                ) : (
                  <p className="text-[12px] text-zinc-600">Lending this device’s compute. The other device earns credit for the work you serve.</p>
                )}
                <button type="button" onClick={reset} className="mt-1 rounded-lg bg-zinc-100 px-3 py-1.5 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-200">Disconnect</button>
              </div>
            ) : (
              <>
                <div className="mb-4 flex gap-1 rounded-lg bg-zinc-100 p-0.5 text-[12px] font-semibold">
                  <button type="button" onClick={() => { reset(); startUse(); }}
                    className={['flex-1 rounded-md px-2 py-1', mode === 'use' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'].join(' ')}>
                    Use a device
                  </button>
                  <button type="button" disabled={!canLend} onClick={() => { reset(); setMode('lend'); }}
                    className={['flex-1 rounded-md px-2 py-1 disabled:opacity-40', mode === 'lend' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'].join(' ')}>
                    Lend this device
                  </button>
                </div>

                {error && <p className="mb-2 text-[12px] text-rose-600">{error}</p>}

                {/* The blob THIS device shows the other (QR + copy). */}
                {myBlob && (
                  <div className="mb-3 space-y-2">
                    <p className="text-[12px] text-zinc-500">
                      {mode === 'use' ? 'Scan this on the device you want to lend, then paste its reply below.' : 'Scan this back on the coding device to finish.'}
                    </p>
                    {myQr && <img src={myQr} alt="pairing code" className="mx-auto h-44 w-44 rounded-lg border border-zinc-200" />}
                    <button type="button" onClick={copy} className="flex w-full items-center justify-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-zinc-700">
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy code'}
                    </button>
                  </div>
                )}

                {/* Initiator (use) waits for the answer paste; responder (lend) takes the offer paste. */}
                {mode === 'use' && myBlob && (
                  <div className="flex gap-2">
                    <textarea value={theirBlob} onChange={(e) => setTheirBlob(e.target.value)} placeholder="paste the other device’s reply"
                      className="flex-1 resize-none rounded-lg border border-zinc-200 px-3 py-2 text-[12px] outline-none focus:border-zinc-400" rows={2} />
                    <button type="button" onClick={finishUse} disabled={!theirBlob.trim()}
                      className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-2 text-[12px] font-semibold text-white hover:bg-zinc-700 disabled:opacity-40">
                      <ArrowDownToLine className="h-3.5 w-3.5" /> Link
                    </button>
                  </div>
                )}

                {mode === 'lend' && !myBlob && (
                  <div className="flex gap-2">
                    <textarea value={theirBlob} onChange={(e) => setTheirBlob(e.target.value)} placeholder="paste the coding device’s code"
                      className="flex-1 resize-none rounded-lg border border-zinc-200 px-3 py-2 text-[12px] outline-none focus:border-zinc-400" rows={2} />
                    <button type="button" onClick={() => startLend(theirBlob)} disabled={!theirBlob.trim()}
                      className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-2 text-[12px] font-semibold text-white hover:bg-zinc-700 disabled:opacity-40">
                      <QrCode className="h-3.5 w-3.5" /> Reply
                    </button>
                  </div>
                )}

                {state === 'connecting' && <p className="mt-2 flex items-center gap-1.5 text-[12px] text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Connecting…</p>}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
