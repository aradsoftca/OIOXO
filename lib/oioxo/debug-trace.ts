/**
 * oioxo Code — RECORD-REPLAY TIME-TRAVEL DEBUGGING (Gem 7). Today the loop hands
 * the model an error STRING. That's thin: "Cannot read x of undefined" doesn't say
 * what the app was DOING. Here the running preview records a deterministic timeline
 * (events, state snapshots, logs, the throw), and the analyzer extracts the FAULT
 * WINDOW — the handful of steps right before the failure, with the last known state
 * — so the model reasons over ground truth instead of guessing. Deterministic
 * seeding (RNG/time) makes a fault reproducible so a fix can be re-verified against
 * the exact scenario.
 *
 * Pure analyzer + the injectable probe string are Node-testable; wiring the probe
 * into the live preview (preview-oracle) is the browser step.
 */

export type TraceKind = 'event' | 'state' | 'log' | 'call' | 'error';
export interface TraceEvent {
  seq: number;
  kind: TraceKind;
  label: string;
  /** Optional structured payload (a state snapshot, args, etc.). */
  data?: unknown;
  /** ms since record start (deterministic under the seeded clock). */
  t?: number;
}

export interface FaultWindow {
  /** The events leading up to (and including) the failure. */
  window: TraceEvent[];
  /** The failing event, if the trace contains one. */
  fault?: TraceEvent;
  /** The most recent state snapshot before the fault (the "what did the world look
   *  like when it broke" frame). */
  lastState?: TraceEvent;
}

/**
 * Extract the fault window from a recorded trace: the first error event and the
 * `before` events preceding it, plus the latest state snapshot before the fault.
 * No error in the trace → the tail of the timeline (still useful context). Pure.
 */
export function faultWindow(trace: TraceEvent[], before = 8): FaultWindow {
  if (!trace.length) return { window: [] };
  const faultIdx = trace.findIndex((e) => e.kind === 'error');
  if (faultIdx < 0) {
    const window = trace.slice(-before);
    const lastState = [...window].reverse().find((e) => e.kind === 'state');
    return { window, lastState };
  }
  const start = Math.max(0, faultIdx - before);
  const window = trace.slice(start, faultIdx + 1);
  const fault = trace[faultIdx];
  const lastState = [...trace.slice(0, faultIdx)].reverse().find((e) => e.kind === 'state');
  return { window, fault, lastState };
}

const clip = (v: unknown, n = 200): string => {
  let s: string;
  try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch { s = String(v); }
  s = s ?? String(v);
  return s.length > n ? s.slice(0, n) + '…' : s;
};

/**
 * Render the fault window as compact repair context for the model — the timeline of
 * what happened, the last known state, and the failure. Far richer than the bare
 * error, and small enough for a weak model's context.
 */
export function formatFault(fw: FaultWindow): string {
  if (!fw.window.length) return '';
  const lines = fw.window.map((e) => {
    const tag = e.kind.toUpperCase().padEnd(5);
    const data = e.data !== undefined ? `  ${clip(e.data)}` : '';
    return `  #${e.seq} ${tag} ${e.label}${data}`;
  });
  const parts = [`What was happening just before it broke:`, ...lines];
  if (fw.lastState) parts.push(`\nLast known state: ${clip(fw.lastState.data)}`);
  if (fw.fault) parts.push(`\nFailure: ${fw.fault.label}${fw.fault.data !== undefined ? ' — ' + clip(fw.fault.data) : ''}`);
  return parts.join('\n');
}

/** Deterministic seeding snippet: makes Math.random + Date.now reproducible so a
 *  recorded fault REPLAYS identically and a fix can be verified against it. Inject
 *  before the app's own script. */
export function seedScript(seed = 1): string {
  return (
    `(function(){var s=${seed}>>>0;` +
    `Math.random=function(){s=(s*1664525+1013904223)>>>0;return s/4294967296;};` +
    `var t=0;var D=Date;window.Date=function(){return new D(0);};window.Date.now=function(){return (t+=16);};` +
    `window.Date.prototype=D.prototype;})();`
  );
}

/**
 * The RECORD probe (injected into the preview, sibling of preview-oracle's PROBE):
 * builds window.__oioxoTrace from console, dispatched events, explicit
 * window.__oioxoRecord(label,state) calls, and the first uncaught error. Posts the
 * trace to the parent so the loop can analyze the fault window. Browser-only string.
 */
export const RECORD_PROBE =
  '<script>(function(){var T=[],n=0,t0=Date.now();window.__oioxoTrace=T;' +
  'function push(kind,label,data){if(T.length<400)T.push({seq:n++,kind:kind,label:String(label),data:data,t:Date.now()-t0});}' +
  'window.__oioxoRecord=function(label,state){push("state",label,state);};' +
  'try{var ce=console.log;console.log=function(){push("log",Array.prototype.map.call(arguments,String).join(" "));return ce.apply(console,arguments);};}catch(_){}' +
  'try{var ael=EventTarget.prototype.addEventListener;EventTarget.prototype.addEventListener=function(ty,fn,o){var w=function(e){push("event",ty);return fn.apply(this,arguments);};return ael.call(this,ty,w,o);};}catch(_){}' +
  'window.addEventListener("error",function(e){push("error",(e.message||"error"),(e.filename?(e.filename.split("/").pop()+":"+e.lineno):""));try{parent.postMessage({__oioxo:"trace",trace:T},"*");}catch(_){}});' +
  '})();</script>';
