/**
 * Bridge between xonvert.com pages and the Xonvert mobile app (Flutter WebView).
 *
 * The app loads the real site, so every tool stays in sync with the web. It
 * identifies itself with "XonvertApp/<ver>" in the user agent and exposes a
 * JavaScript channel `XonvertBridge` (postMessage(string)). The app talks back by
 * calling window.__xonvertAppEvent(json).
 *
 *   page → app  {type:'saveFile', name, mime, data(base64)}   a finished result
 *               {type:'rewardedAd', id, ticket, category}      show an AdMob rewarded ad
 *   app → page  {type:'adResult', id, ok}                      the ad finished (or not)
 *               {type:'files', files:[{name, mime, data}]}     files picked / shared into the app
 *
 * Files are processed in the page on the phone; the bridge only hands bytes to
 * and from the native side. Nothing here talks to our server except the ad ticket.
 */

type AppEvent =
  | { type: 'adResult'; id: string; ok: boolean }
  | { type: 'files'; files: { name: string; mime: string; data: string }[] };

interface BridgeWindow extends Window {
  XonvertBridge?: { postMessage(msg: string): void };
  __xonvertAppEvent?: (e: AppEvent | string) => void;
}

const w = () => (typeof window === 'undefined' ? null : (window as BridgeWindow));

export function isInApp(): boolean {
  const win = w();
  return !!win && /XonvertApp\//.test(navigator.userAgent) && !!win.XonvertBridge;
}

function post(msg: unknown) {
  w()?.XonvertBridge?.postMessage(JSON.stringify(msg));
}

async function toBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Hand a finished result to the app (native save / share sheet). */
export async function sendFileToApp(blob: Blob, name: string): Promise<void> {
  post({ type: 'saveFile', name, mime: blob.type || 'application/octet-stream', data: await toBase64(blob) });
}

const pendingAds = new Map<string, (ok: boolean) => void>();

/**
 * Ask the app to show a rewarded ad for this meter key. Resolves true once the
 * ad finished; the +uses are granted by AdMob's server callback, so the caller
 * should re-check /api/usage afterwards (give the callback a moment to land).
 */
export async function requestRewardedAd(category: string): Promise<boolean> {
  // The ticket only feeds AdMob's server-side verification; a failed ticket
  // request must not stop the ad from showing.
  let ticket = '';
  try {
    const res = await fetch('/api/usage/ad-ticket', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ category }),
    });
    if (res.ok) ticket = ((await res.json()) as { ticket?: string }).ticket || '';
  } catch { /* show the ad anyway */ }
  const id = Math.random().toString(36).slice(2);
  return new Promise<boolean>((resolve) => {
    pendingAds.set(id, resolve);
    post({ type: 'rewardedAd', id, ticket, category });
    // An ad that never reports back must not hang the tool forever.
    setTimeout(() => { if (pendingAds.delete(id)) resolve(false); }, 5 * 60_000);
  });
}

/**
 * The app's free tier (owner decision 2026-09-29): no daily limits — an ad
 * before an export instead. Pro never sees ads. Free users get a rewarded ad
 * (at most one per AD_COOLDOWN_MS so batch tools don't show one per file) and
 * the export ALWAYS goes ahead afterwards, whether the ad was watched, closed,
 * or had no fill. Size limits, the watermark and branded file names stay.
 */
const AD_COOLDOWN_MS = 60_000;
const AD_LAST_KEY = 'xv:app-ad-last';
/** Tool pages that keep a large AI model (or OCR engine) in memory at export time. */
const HEAVY_AI_PATH = /\/(tools\/(image-(upscale|enhance|remove-bg|colorize|inpaint|object-remove|ocr)|audio-(to-text|stem|vocal-remover|remove-noise)|subtitle-generate|video-auto-dub|text-translate|pdf-ocr|studio-[a-z-]*ai[a-z-]*)|convert\/[a-z0-9]+-to-txt)\b/;
export async function appAdGate(category: string): Promise<boolean> {
  try {
    const { isWatermarkOn } = await import('@/lib/watermark/config');
    if (!(await isWatermarkOn())) return true; // Pro
  } catch { /* unknown → treat as free */ }
  // iPhone: an AI model still in memory + the ad SDK's own web view is more than
  // iOS allows — it kills this page (measured: upscale crashed only when the ad
  // loaded). On memory-constrained devices, AI tools export without an ad.
  try {
    const { isMemoryConstrained } = await import('@/lib/compute/device-profile');
    const heavy = !!(globalThis as { __xvHeavyModel?: boolean }).__xvHeavyModel || HEAVY_AI_PATH.test(location.pathname);
    if (heavy && isMemoryConstrained()) return true;
  } catch { /* fall through to the ad */ }
  let last = 0;
  try { last = Number(sessionStorage.getItem(AD_LAST_KEY) || 0); } catch { /* ignore */ }
  if (Date.now() - last < AD_COOLDOWN_MS) return true;
  try { sessionStorage.setItem(AD_LAST_KEY, String(Date.now())); } catch { /* ignore */ }
  await requestRewardedAd(category).catch(() => false);
  return true;
}

function b64ToFile(f: { name: string; mime: string; data: string }): File {
  const bin = atob(f.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], f.name, { type: f.mime });
}

/** Put files from the app into the page's file input, as if the user picked them. */
function deliverFiles(files: File[]) {
  const input = document.querySelector<HTMLInputElement>('main input[type=file]');
  if (!input) return;
  const dt = new DataTransfer();
  for (const f of input.multiple ? files : files.slice(0, 1)) dt.items.add(f);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

let installed = false;

/** Wire the app's callbacks and route downloads to the app. No-op outside the app. */
export function installAppBridge(): void {
  const win = w();
  if (installed || !win || !isInApp()) return;
  installed = true;

  win.__xonvertAppEvent = (raw) => {
    const e = (typeof raw === 'string' ? JSON.parse(raw) : raw) as AppEvent;
    if (e.type === 'adResult') {
      const r = pendingAds.get(e.id);
      if (r) { pendingAds.delete(e.id); r(!!e.ok); }
    } else if (e.type === 'files') {
      deliverFiles(e.files.map(b64ToFile));
    }
  };

  // A WebView cannot save blob:/data: downloads, so every result that reaches the
  // browser's default download action goes to the app instead. Bubble phase on
  // window: the usage gate (document, capture) has already run, and a download it
  // held back arrives here later as its own re-save click.
  const grab = (a: HTMLAnchorElement): boolean => {
    const href = a.href;
    if (!a.hasAttribute('download') || !href || !(href.startsWith('blob:') || href.startsWith('data:'))) return false;
    const name = a.download || 'download';
    void fetch(href).then((r) => r.blob()).then((b) => sendFileToApp(b, name)).catch(() => {});
    return true;
  };
  win.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    const a = (e.target as HTMLElement | null)?.closest?.('a[download]') as HTMLAnchorElement | null;
    if (a && grab(a)) e.preventDefault();
  });
  // Tools that click a DETACHED anchor never dispatch into the document.
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (!this.isConnected && grab(this)) return;
    return click.call(this);
  };
  // FileSaver (jsPDF's pdf.save) dispatches a synthetic MouseEvent on a detached anchor instead.
  const dispatch = HTMLAnchorElement.prototype.dispatchEvent;
  HTMLAnchorElement.prototype.dispatchEvent = function (this: HTMLAnchorElement, ev: Event) {
    if (ev.type === 'click' && !this.isConnected && grab(this)) return false;
    return dispatch.call(this, ev);
  };
}
