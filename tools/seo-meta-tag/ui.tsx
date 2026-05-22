'use client';
import { TextTool } from '@/components/tool/TextTool';
import { extractTitle, extractMeta } from '@/engines/html';

const ESSENTIAL_METAS = ['description', 'viewport', 'robots'];
const ESSENTIAL_OG = ['og:title', 'og:description', 'og:image', 'og:url'];

export default function Tool() {
  return (
    <TextTool
      toolId="seo-meta-tag"
      colorVar="--color-cat-seo"
      urlFetch={{ endpoint: '/api/seo/fetch', placeholder: 'https://example.com — fetch live page' }}
      inputPlaceholder="Fetch a URL above, or paste your full HTML <head>…"
      transform={(html) => {
        if (!html.trim()) return 'Paste HTML to analyze.';
        const title = extractTitle(html);
        const metas = extractMeta(html);

        const titleLen = title.length;
        const desc = metas.find((m) => m.name?.toLowerCase() === 'description')?.content ?? '';
        const descLen = desc.length;

        const lines: string[] = [];
        lines.push('── Page identity ──');
        lines.push(`Title (${titleLen} chars): ${title || '— missing —'}`);
        if (titleLen > 0) {
          if (titleLen < 30)     lines.push('  ⚠ too short — aim for 50–60 chars');
          else if (titleLen > 70) lines.push('  ⚠ may be truncated in search results');
        }
        lines.push(`Description (${descLen} chars): ${desc || '— missing —'}`);
        if (descLen > 0) {
          if (descLen < 70)      lines.push('  ⚠ too short — aim for 140–160 chars');
          else if (descLen > 170) lines.push('  ⚠ may be truncated in search results');
        }

        const missingEss = ESSENTIAL_METAS.filter((k) => !metas.some((m) => m.name?.toLowerCase() === k));
        const missingOg  = ESSENTIAL_OG.filter((k) => !metas.some((m) => m.property?.toLowerCase() === k));

        lines.push('', '── Essential meta tags ──');
        for (const k of ESSENTIAL_METAS) {
          const m = metas.find((x) => x.name?.toLowerCase() === k);
          lines.push(`${k.padEnd(15)} ${m?.content ?? '— missing —'}`);
        }

        lines.push('', '── Open Graph ──');
        for (const k of ESSENTIAL_OG) {
          const m = metas.find((x) => x.property?.toLowerCase() === k);
          lines.push(`${k.padEnd(20)} ${m?.content ?? '— missing —'}`);
        }

        const twitter = metas.filter((m) => m.name?.toLowerCase().startsWith('twitter:'));
        if (twitter.length > 0) {
          lines.push('', '── Twitter Card ──');
          for (const t of twitter) lines.push(`${(t.name ?? '').padEnd(20)} ${t.content ?? ''}`);
        }

        lines.push('', `── Found ${metas.length} meta tag${metas.length === 1 ? '' : 's'} total ──`);
        if (missingEss.length) lines.push(`⚠ Missing essentials: ${missingEss.join(', ')}`);
        if (missingOg.length)  lines.push(`⚠ Missing OG tags: ${missingOg.join(', ')}`);

        return lines.join('\n');
      }}
    />
  );
}
