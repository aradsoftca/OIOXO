// Target of the next.config rewrite for old root-level `/{a}-to-{b}` URLs.
// Real routes win (the rewrite runs after the filesystem), so only paths that
// would otherwise 404 land here.
import { NextResponse } from 'next/server';
import { legacyDestination } from '@/lib/convert/legacy';
import { BRAND_DOMAIN } from '@/lib/brand';

export async function GET(_req: Request, { params }: { params: Promise<{ pair: string }> }) {
  const { pair } = await params;
  return NextResponse.redirect(new URL(legacyDestination(pair), `https://${BRAND_DOMAIN}`), 308);
}
