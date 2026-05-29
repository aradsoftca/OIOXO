/**
 * Tiny module singleton that lets the explicit `useUsageGate` callers and the
 * global download interceptor (UsageGateProvider) coordinate, without a React
 * context.
 *
 * When a tool gates an action explicitly (e.g. ImageFilterTool calls guard()
 * before export), it "arms" a one-shot bypass so the download that follows
 * isn't charged a SECOND time by the global interceptor.
 */

let bypass = false;
let bypassExp = 0;
// Window in which the bypass is honoured. The explicit gate fires its
// download synchronously after guard() resolves, so a generous 5s window
// covers the slowest path (e.g. an ffmpeg.wasm encode on a small phone) but
// is short enough that an unrelated download clicked later in the session
// can't accidentally claim the bypass.
const BYPASS_TTL_MS = 5000;

/** Called by an explicit gate after it has already consumed a use. */
export function armDownloadBypass(): void {
  bypass = true;
  bypassExp = Date.now() + BYPASS_TTL_MS;
}

/** The interceptor consumes the one-shot bypass (true = let this download through). */
export function consumeDownloadBypass(): boolean {
  if (!bypass) return false;
  if (Date.now() > bypassExp) {
    // Stale arm — drop it. Without this, a tool that armed the bypass but
    // failed to download (encode error, user dismissed the file dialog)
    // would let the NEXT unrelated download — possibly hours later, on a
    // different tool — slip through the gate for free.
    bypass = false;
    bypassExp = 0;
    return false;
  }
  bypass = false;
  bypassExp = 0;
  return true;
}
