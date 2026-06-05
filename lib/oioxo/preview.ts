/**
 * oioxo Code — INSTANT SERVER-FREE PREVIEW (weak-device "see results" gem). Today a
 * preview means booting a WebContainer (a whole Node runtime in the tab) — seconds
 * + tens of MB, painful on an old device, and pure overkill for the MAJORITY of
 * products, which are static/SPA (HTML/CSS/JS). This renders those directly in an
 * iframe via `srcdoc` with everything inlined — **no server, ~0 memory, instant,
 * works offline, refreshes the moment you edit.** WebContainer is reserved for
 * projects that genuinely need Node (a dev server / backend).
 *
 * Pure doc builder (Node-testable); the browser glue is a one-liner
 * (`iframe.srcdoc = buildStaticPreview(files)`).
 */
import type { CodeFile } from './codeloop';
import { inlineSite } from './publish';

const has = (files: CodeFile[], re: RegExp) => files.some((f) => re.test(f.path));
const find = (files: CodeFile[], re: RegExp) => files.find((f) => re.test(f.path));

/**
 * Does this project actually need a Node server (→ WebContainer), or can it run as
 * a static preview (→ instant srcdoc)? A package.json whose start/dev script boots
 * a server, or a file that creates an http server, needs Node. Everything else —
 * plain HTML/CSS/JS, a canvas game, a vanilla SPA — is static.
 */
export function needsServer(files: CodeFile[]): boolean {
  const pkg = find(files, /(^|\/)package\.json$/);
  if (pkg) {
    try {
      const j = JSON.parse(pkg.content) as { scripts?: Record<string, string>; dependencies?: Record<string, string> };
      const scripts = Object.values(j.scripts ?? {}).join(' ');
      if (/\b(next|vite|nodemon|node |ts-node|express|fastify|serve|http-server|webpack serve|remix|nuxt)\b/.test(scripts)) return true;
      if (j.dependencies && /\b(next|express|fastify|koa|nuxt|remix)\b/.test(Object.keys(j.dependencies).join(' '))) return true;
    } catch { /* unparseable package.json → treat as static */ }
  }
  // A file that stands up an http server (and no html to show) → needs Node.
  if (has(files, /\.(js|ts|mjs)$/) && !has(files, /\.html$/) &&
      files.some((f) => /\.(js|ts|mjs)$/.test(f.path) && /createServer|listen\(|http\.|express\(\)/.test(f.content))) return true;
  return false;
}

/** Choose the cheapest preview engine for this project. */
export function previewKind(files: CodeFile[]): 'static' | 'server' {
  return needsServer(files) ? 'server' : 'static';
}

/** The CSS in the project, concatenated (for synthesizing a wrapper when there's
 *  no HTML entry — e.g. a canvas game that's just script.js + style.css). */
function allCss(files: CodeFile[]): string {
  return files.filter((f) => f.path.toLowerCase().endsWith('.css')).map((f) => f.content).join('\n');
}
function allClassicJs(files: CodeFile[]): string {
  // Non-module JS, in a stable order (entry-ish names last so they run after deps).
  const js = files.filter((f) => /\.(js|mjs)$/i.test(f.path) && !/\b(import|export)\b/.test(f.content));
  js.sort((a, b) => Number(/index|main|app|game|script/i.test(a.path)) - Number(/index|main|app|game|script/i.test(b.path)));
  return js.map((f) => f.content).join('\n;\n');
}

/**
 * Build a single self-contained HTML document to drop into an iframe `srcdoc` for
 * an instant, server-free preview. If there's an HTML entry we inline its local
 * CSS/JS (via inlineSite); if there's none (a JS-only sketch/game) we synthesize a
 * minimal page that mounts a <canvas>/<div> and runs the script. `headInject` lets
 * the caller add the runtime probe (oracle / record-replay) without a server.
 */
export function buildStaticPreview(files: CodeFile[], opts: { headInject?: string } = {}): string {
  const inject = opts.headInject ?? '';
  const htmlFile = find(files, /(^|\/)index\.html$/i) ?? find(files, /\.html$/i);
  if (htmlFile) {
    const doc = inlineSite(files);
    return inject ? injectHead(doc, inject) : doc;
  }
  // No HTML → synthesize a runnable shell around the project's CSS + classic JS.
  const css = allCss(files);
  const js = allClassicJs(files);
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<style>html,body{margin:0;height:100%}canvas{display:block}</style>' +
    (css ? `<style>${css}</style>` : '') + inject +
    '</head><body><canvas id="game" width="800" height="600"></canvas><div id="app"></div>' +
    (js ? `<script>${js}</script>` : '') +
    '</body></html>'
  );
}

/** Insert markup just before </head> (or prepend if there's no head). */
function injectHead(html: string, snippet: string): string {
  return html.includes('</head>') ? html.replace('</head>', snippet + '</head>') : snippet + html;
}
