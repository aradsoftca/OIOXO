'use client';
import { TextTool } from '@/components/tool/TextTool';

function xmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

export default function Tool() {
  return (
    <TextTool
      toolId="seo-sitemap"
      colorVar="--color-cat-seo"
      inputPlaceholder="One URL per line:
https://example.com/
https://example.com/about
https://example.com/blog"
      transform={(s, o) => {
        if (!s.trim()) return '';
        const urls = s.split(/\r?\n/).map((u) => u.trim()).filter(Boolean);
        const lastmod = String(o.lastmod ?? new Date().toISOString().slice(0, 10));
        const changefreq = String(o.changefreq ?? 'weekly');
        const priority = Number(o.priority) || 0.8;
        const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
        lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
        for (const url of urls) {
          lines.push('  <url>');
          lines.push(`    <loc>${xmlEscape(url)}</loc>`);
          if (o.includeLastmod)    lines.push(`    <lastmod>${lastmod}</lastmod>`);
          if (o.includeChangefreq) lines.push(`    <changefreq>${changefreq}</changefreq>`);
          if (o.includePriority)   lines.push(`    <priority>${priority.toFixed(1)}</priority>`);
          lines.push('  </url>');
        }
        lines.push('</urlset>');
        return lines.join('\n');
      }}
      controls={[
        { id: 'lastmod',           label: 'Last modified (YYYY-MM-DD)', type: 'text', defaultValue: new Date().toISOString().slice(0, 10) },
        { id: 'includeLastmod',    label: 'Include <lastmod>',    type: 'toggle', defaultValue: true },
        {
          id: 'changefreq', label: 'Change frequency', type: 'select', defaultValue: 'weekly',
          options: [
            { value: 'always',  label: 'Always' },
            { value: 'hourly',  label: 'Hourly' },
            { value: 'daily',   label: 'Daily' },
            { value: 'weekly',  label: 'Weekly' },
            { value: 'monthly', label: 'Monthly' },
            { value: 'yearly',  label: 'Yearly' },
            { value: 'never',   label: 'Never' },
          ],
        },
        { id: 'includeChangefreq', label: 'Include <changefreq>', type: 'toggle', defaultValue: true },
        { id: 'priority',          label: 'Priority',             type: 'number', defaultValue: 0.8, min: 0, max: 1, step: 0.1 },
        { id: 'includePriority',   label: 'Include <priority>',   type: 'toggle', defaultValue: true },
      ]}
    />
  );
}
