import { NextResponse } from 'next/server';

/**
 * CORS for the native Xtudio app endpoints. The Capacitor WebView runs at
 * https://localhost (Android) / capacitor://localhost (iOS), so a browser fetch
 * to xonvert.com is cross-origin and the WebView blocks the response unless we
 * echo these headers. We allow ONLY the Capacitor origins (not "*") so the app
 * endpoints don't become open CORS surfaces for arbitrary sites. Auth still
 * requires the bearer/credentials, so this only governs who may READ the
 * response, not who is authorized.
 */
const ALLOWED_APP_ORIGINS = new Set([
  'https://localhost',
  'capacitor://localhost',
  'http://localhost',
  'ionic://localhost',
]);

export function appCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  if (!ALLOWED_APP_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/** Standard preflight response for the app endpoints. */
export function appCorsPreflight(req: Request): NextResponse {
  return new NextResponse(null, { status: 204, headers: appCorsHeaders(req) });
}
