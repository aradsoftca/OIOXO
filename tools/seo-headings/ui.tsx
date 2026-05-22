'use client';
import { TextTool } from '@/components/tool/TextTool';
import { extractHeadings } from '@/engines/html';

export default function Tool() {
  return (
    <TextTool
      toolId="seo-headings"
      colorVar="--color-cat-seo"
      inputPlaceholder="Paste your HTML…"
      transform={(html) => {
        if (!html.trim()) return 'Paste HTML to inspect the heading outline.';
        const headings = extractHeadings(html);
        if (headings.length === 0) return 'No headings found.';

        const lines: string[] = [];
        const counts = [0, 0, 0, 0, 0, 0, 0];
        let lastLevel = 0;
        const warnings: string[] = [];
        for (const h of headings) {
          counts[h.level]++;
          const indent = '   '.repeat(h.level - 1);
          lines.push(`${indent}H${h.level}  ${h.text}`);
          if (lastLevel > 0 && h.level > lastLevel + 1) {
            warnings.push(`  ⚠ Skipped from H${lastLevel} to H${h.level} ("${h.text.slice(0, 50)}")`);
          }
          lastLevel = h.level;
        }
        if (counts[1] === 0) warnings.unshift('  ⚠ No H1 found — every page should have exactly one');
        else if (counts[1] > 1) warnings.unshift(`  ⚠ ${counts[1]} H1 tags — pages should have exactly one`);

        const summary = `H1:${counts[1]}  H2:${counts[2]}  H3:${counts[3]}  H4:${counts[4]}  H5:${counts[5]}  H6:${counts[6]}`;
        return [
          '── Outline ──',
          ...lines,
          '',
          `── Summary ──  ${summary}`,
          ...(warnings.length ? ['', '── Issues ──', ...warnings] : ['', '✓ No structural issues']),
        ].join('\n');
      }}
    />
  );
}
