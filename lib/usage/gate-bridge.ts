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

/** Called by an explicit gate after it has already consumed a use. */
export function armDownloadBypass(): void {
  bypass = true;
}

/** The interceptor consumes the one-shot bypass (true = let this download through). */
export function consumeDownloadBypass(): boolean {
  const b = bypass;
  bypass = false;
  return b;
}
