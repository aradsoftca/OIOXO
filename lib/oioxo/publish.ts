/**
 * oioxo Code — PUBLISH / SHOW a finished project (roadmap #4). Building it isn't
 * enough; the user wants to SHIP a complete site. This is the host-nothing publish
 * layer:
 *   - inlineSite: fold a multi-file static site into ONE self-contained .html
 *     (CSS/JS inlined) you can open or share anywhere — the simplest "ship it".
 *   - preparePublish: map the project to a target — a single bundle, a GitHub Pages
 *     branch (reuses the GitHub backend), or a live P2P share (reuses Send).
 *
 * Pure + Node-testable; the transport (GitHub push / P2P) is the existing wired
 * infra, this just shapes the artifact.
 */
import type { CodeFile } from './codeloop';

const baseName = (p: string) => p.split('/').pop()!.toLowerCase();
const isRemote = (url: string) => /^(https?:)?\/\//i.test(url) || url.startsWith('data:');

/**
 * Inline a static site into one self-contained HTML: replace `<link rel=stylesheet
 * href=local.css>` with the CSS in a <style>, and `<script src=local.js>` with the
 * JS in a <script>. Remote URLs are left alone. Matches files by basename, so
 * ./style.css, style.css, and css/style.css all resolve. Returns the HTML.
 */
export function inlineSite(files: CodeFile[]): string {
  const byBase = new Map(files.map((f) => [baseName(f.path), f.content]));
  const html = files.find((f) => /(^|\/)index\.html$/i.test(f.path)) ?? files.find((f) => f.path.toLowerCase().endsWith('.html'));
  if (!html) return files.map((f) => f.content).join('\n');
  let out = html.content;

  out = out.replace(/<link\b[^>]*?href=["']([^"']+\.css)["'][^>]*?>/gi, (m, href) => {
    if (isRemote(href)) return m;
    const css = byBase.get(baseName(href));
    return css != null ? `<style>\n${css.trim()}\n</style>` : m;
  });

  out = out.replace(/<script\b[^>]*?src=["']([^"']+\.js)["'][^>]*?>\s*<\/script>/gi, (m, src) => {
    if (isRemote(src)) return m;
    const js = byBase.get(baseName(src));
    return js != null ? `<script>\n${js.trim()}\n</script>` : m;
  });

  return out;
}

export type PublishKind = 'bundle' | 'github-pages' | 'p2p-live';

export interface PublishArtifact {
  kind: PublishKind;
  /** The files to ship (for bundle / github-pages). */
  files?: CodeFile[];
  /** A single self-contained HTML (for bundle of a static site / p2p-live). */
  html?: string;
  /** GitHub Pages: the branch + commit message to push to (via the GitHub backend). */
  branch?: string;
  message?: string;
  note: string;
}

const isStaticSite = (files: CodeFile[]) =>
  files.some((f) => /\.html$/i.test(f.path)) && !files.some((f) => f.path === 'package.json');

/**
 * Prepare a project for a publish target (host-nothing). 'bundle' → one self-
 * contained HTML for a static site, else the raw files; 'github-pages' → files +
 * a .nojekyll on the gh-pages branch (push via the existing GitHub backend);
 * 'p2p-live' → a single HTML to stream to a peer over the Send channel.
 */
export function preparePublish(files: CodeFile[], kind: PublishKind): PublishArtifact {
  if (kind === 'github-pages') {
    const out = [...files];
    if (!out.some((f) => baseName(f.path) === '.nojekyll')) out.push({ path: '.nojekyll', content: '' });
    return { kind, files: out, branch: 'gh-pages', message: 'Publish via oioxo', note: 'Push to the gh-pages branch with the GitHub backend; Pages serves it.' };
  }
  if (kind === 'p2p-live') {
    return { kind, html: isStaticSite(files) ? inlineSite(files) : undefined, files, note: 'Stream the running project to a peer over the P2P Send channel.' };
  }
  // bundle: a static site collapses to one openable file; otherwise ship the tree.
  return isStaticSite(files)
    ? { kind, html: inlineSite(files), note: 'One self-contained .html — open it anywhere, no server.' }
    : { kind, files, note: 'Download the project; run it with its own start command.' };
}

export function publishTargets(): { kind: PublishKind; label: string }[] {
  return [
    { kind: 'bundle', label: 'Download a self-contained file' },
    { kind: 'github-pages', label: 'Publish to GitHub Pages' },
    { kind: 'p2p-live', label: 'Share it live (peer-to-peer)' },
  ];
}
