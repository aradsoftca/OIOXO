/**
 * Minimal HTML sanitizer for rendering CONVERTED FILE content (docx, epub,
 * html, etc.) via dangerouslySetInnerHTML / innerHTML. NOT a general-purpose
 * sanitizer — its goal is to defeat the obvious XSS vectors a malicious
 * shared file could carry through mammoth / foliate / our own converters:
 *
 *   - <script>, <iframe>, <object>, <embed>, <link>, <meta>, <base>
 *   - <style> (CSS expression + url(javascript:…))
 *   - Inline event handlers: on* attributes
 *   - URL-bearing attributes pointing at javascript:/data: schemes
 *
 * Runs in the browser only — uses the platform's HTML parser so we don't
 * have to ship a tag parser. Returns a fragment whose outerHTML is safe to
 * assign back.
 *
 * If DOMPurify is later added as a dependency this can be replaced with one
 * call; meanwhile this keeps the bundle small and the tools safe TODAY.
 */

const FORBIDDEN_TAGS = new Set([
  'script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'style', 'form', 'input', 'button', 'textarea', 'select', 'option',
]);

const ALLOWED_URL_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:', '']);

function safeUrl(value: string): string {
  try {
    const u = new URL(value, 'http://x.invalid/');
    // Reject obvious XSS schemes.
    if (!ALLOWED_URL_SCHEMES.has(u.protocol)) return '';
    return value;
  } catch {
    // Relative paths and fragments are OK.
    return /^[a-z]+:/i.test(value) ? '' : value;
  }
}

function walk(node: Element) {
  // Walk a copy of the children list — we may remove elements during traversal.
  const children = Array.from(node.children);
  for (const child of children) {
    const tag = child.tagName.toLowerCase();
    if (FORBIDDEN_TAGS.has(tag)) {
      child.remove();
      continue;
    }
    // Strip event-handler attributes and unsafe URL schemes.
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) { child.removeAttribute(attr.name); continue; }
      if (name === 'srcdoc') { child.removeAttribute(attr.name); continue; }
      if (name === 'href' || name === 'src' || name === 'action' || name === 'formaction' || name === 'background' || name === 'poster' || name === 'xlink:href') {
        const cleaned = safeUrl(attr.value);
        if (cleaned !== attr.value) {
          if (cleaned) child.setAttribute(attr.name, cleaned);
          else child.removeAttribute(attr.name);
        }
      }
      // srcset is a comma-separated list of URLs + descriptors. Sanitize each
      // candidate's URL; drop the whole attribute if any entry rejects (don't
      // try to partially repair — the comma-format makes it easy to ship a
      // poisoned URL past a parser that ignores the bad entry).
      if (name === 'srcset') {
        const parts = attr.value.split(',').map((p) => p.trim()).filter(Boolean);
        let bad = false;
        const fixed = parts.map((part) => {
          const [url, ...rest] = part.split(/\s+/);
          const cleaned = safeUrl(url);
          if (cleaned !== url) bad = true;
          return cleaned ? [cleaned, ...rest].join(' ') : '';
        }).filter(Boolean).join(', ');
        if (bad || !fixed) child.removeAttribute(attr.name);
        else if (fixed !== attr.value) child.setAttribute(attr.name, fixed);
      }
      if (name === 'style') {
        // Block CSS expression() and javascript: in url(...)
        if (/expression\s*\(|javascript:/i.test(attr.value)) child.removeAttribute(attr.name);
      }
    }
    walk(child);
  }
}

/**
 * Sanitize an HTML string. Returns a string safe for innerHTML /
 * dangerouslySetInnerHTML. Always assume the input was attacker-controlled.
 */
export function sanitizeHtml(html: string): string {
  if (typeof document === 'undefined') return ''; // SSR safety
  // CRITICAL: parse via DOMParser, not `root.innerHTML = html`. Setting
  // innerHTML actively constructs DOM with side effects — <img src=x
  // onerror=...> fires the handler BEFORE we walk the tree to strip it, so
  // a "sanitize then assign" flow runs the payload before sanitization.
  // DOMParser builds an inert document where image loads don't trigger and
  // scripts/onerror never execute, so we can safely walk + strip first,
  // then return the cleaned innerHTML for the caller to inject.
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  walk(doc.body);
  return doc.body.innerHTML;
}
