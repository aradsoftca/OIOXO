'use client';
import { TextTool } from '@/components/tool/TextTool';

export default function Tool() {
  return (
    <TextTool
      toolId="seo-robots-txt"
      colorVar="--color-cat-seo"
      initialInput=" "
      transform={(_, o) => {
        const userAgent = String(o.userAgent ?? '*');
        const disallow = String(o.disallow ?? '').split(/\n/).map((s) => s.trim()).filter(Boolean);
        const allow    = String(o.allow ?? '').split(/\n/).map((s) => s.trim()).filter(Boolean);
        const sitemap  = String(o.sitemap ?? '').trim();
        const crawlDelay = Number(o.crawlDelay) || 0;

        const lines: string[] = [];
        lines.push(`User-agent: ${userAgent}`);
        if (crawlDelay > 0) lines.push(`Crawl-delay: ${crawlDelay}`);
        for (const p of allow)    lines.push(`Allow: ${p}`);
        for (const p of disallow) lines.push(`Disallow: ${p}`);
        if (o.blockAi) {
          lines.push('');
          for (const bot of ['GPTBot', 'ChatGPT-User', 'Google-Extended', 'CCBot', 'anthropic-ai', 'Claude-Web', 'PerplexityBot']) {
            lines.push(`User-agent: ${bot}`);
            lines.push('Disallow: /');
            lines.push('');
          }
        }
        if (sitemap) {
          lines.push('');
          lines.push(`Sitemap: ${sitemap}`);
        }
        return lines.filter((l, i) => !(l === '' && lines[i - 1] === '')).join('\n').trim() + '\n';
      }}
      controls={[
        { id: 'userAgent', label: 'User-agent', type: 'text', defaultValue: '*' },
        { id: 'disallow',  label: 'Disallow (one per line)', type: 'text', defaultValue: '/admin\n/private' },
        { id: 'allow',     label: 'Allow (one per line)',    type: 'text', defaultValue: '/' },
        { id: 'crawlDelay', label: 'Crawl-delay (seconds, 0 = off)', type: 'number', defaultValue: 0 },
        { id: 'sitemap',   label: 'Sitemap URL', type: 'text', defaultValue: 'https://example.com/sitemap.xml' },
        { id: 'blockAi',   label: 'Block known AI crawlers', type: 'toggle', defaultValue: false },
      ]}
    />
  );
}
