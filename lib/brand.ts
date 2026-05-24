/**
 * Central brand identity. ONE codebase serves two products:
 *   - xonvert.com  → BRAND unset → "Xonvert" (the file-tools product, frozen)
 *   - oioxo.com    → built with NEXT_PUBLIC_BRAND=oioxo → the platform
 *
 * Everything brand-facing reads from here, so the oioxo instance rebrands by
 * env at build time without touching the xonvert build.
 */
export const BRAND = process.env.NEXT_PUBLIC_BRAND || 'Xonvert';
export const IS_OIOXO = BRAND.toLowerCase() === 'oioxo';
export const BRAND_DOMAIN =
  process.env.NEXT_PUBLIC_BRAND_DOMAIN || (IS_OIOXO ? 'oioxo.com' : 'xonvert.com');
export const BRAND_TAGLINE = IS_OIOXO ? 'All-in-one AI' : 'Every file. Every tool. One tap.';
export const BRAND_TITLE = `${BRAND} — ${BRAND_TAGLINE}`;
export const BRAND_DESC = IS_OIOXO
  ? 'An all-in-one AI that runs on your device — chat, convert, edit, create, and code. Private, fast, yours.'
  : 'Convert, compress, edit, and analyze any file. 400+ tools. Files stay yours.';
