import { NextResponse } from 'next/server';
import { CATALOG } from '@/lib/catalog';
import { APPS } from '@/lib/apps';
import { getTool } from '@/lib/registry';
import { isStudioDisabled } from '@/lib/studios/disabled';

/**
 * Tool list for the Xonvert mobile app (lib/app-bridge.ts). The app builds its
 * home, categories and search from this, so it matches the site after every
 * deploy instead of carrying its own hard-coded list. Built at deploy time.
 */
export const dynamic = 'force-static';

export function GET() {
  const categories = CATALOG.map((c) => ({
    id: c.id,
    label: c.label,
    icon: c.icon,
    tools: c.tools
      .filter((t) => !isStudioDisabled(t.slug))
      .map((t) => {
        const m = getTool(t.slug);
        return {
          id: t.slug,
          name: t.label,
          url: t.href || `/tools/${t.slug}`,
          blurb: m?.blurb ?? '',
          icon: m?.icon ?? c.icon,
          accepts: m?.accepts ?? [],
          keywords: m?.keywords ?? [],
        };
      }),
  }));
  const apps = APPS.filter((a) => !a.studio && !a.oioxoOnly).map((a) => ({ id: a.href.replace(/^\//, ''), name: a.name, url: a.href, blurb: a.blurb, icon: a.icon }));
  return NextResponse.json(
    { version: 1, categories, apps },
    { headers: { 'Cloudflare-CDN-Cache-Control': 'max-age=600' } },
  );
}
