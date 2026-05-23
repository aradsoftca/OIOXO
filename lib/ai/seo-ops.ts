/**
 * Xonvert AI — inline SEO snippet generators.
 *
 * Meta tags, Open Graph, Twitter cards, robots.txt and JSON-LD are all text the
 * AI can produce in the chat. It pulls a title / description / URL out of the
 * message (with sensible placeholders when absent). Pure / DOM-free, Node-test.
 */

function field(msg: string, re: RegExp, def: string): string {
  const m = msg.match(re);
  return m ? m[1].trim() : def;
}
const titleOf = (m: string) => field(m, /title[:\s]+["'“]?(.+?)(?=\s*(?:["'”,]|\bdescription\b|\bdesc\b|\burl\b|https?:|$))/i, 'Your Page Title');
const descOf = (m: string) => field(m, /desc(?:ription)?[:\s]+["'“]?(.+?)(?=\s*(?:["'”,]|\btitle\b|\burl\b|https?:|$))/i, 'A concise description of the page.');
const urlOf = (m: string) => field(m, /(https?:\/\/[^\s,]+)/i, 'https://example.com');

export interface SeoOp { verb: string; run: (message: string) => string }

export const SEO_OPS: Record<string, SeoOp> = {
  'seo-meta-tag': { verb: 'generate meta tags', run: (m) =>
    `<title>${titleOf(m)}</title>\n<meta name="description" content="${descOf(m)}">\n<meta name="viewport" content="width=device-width, initial-scale=1">` },
  'seo-open-graph': { verb: 'generate Open Graph tags', run: (m) => {
    const t = titleOf(m), d = descOf(m), u = urlOf(m);
    return `<meta property="og:title" content="${t}">\n<meta property="og:description" content="${d}">\n<meta property="og:url" content="${u}">\n<meta property="og:type" content="website">\n<meta property="og:image" content="${u}/og-image.png">`;
  } },
  'seo-twitter-card': { verb: 'generate a Twitter card', run: (m) => {
    const t = titleOf(m), d = descOf(m), u = urlOf(m);
    return `<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="${t}">\n<meta name="twitter:description" content="${d}">\n<meta name="twitter:image" content="${u}/og-image.png">`;
  } },
  'seo-robots-txt': { verb: 'generate a robots.txt', run: (m) =>
    `User-agent: *\nAllow: /\n\nSitemap: ${urlOf(m)}/sitemap.xml` },
  'seo-structured-data': { verb: 'generate JSON-LD structured data', run: (m) =>
    JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: titleOf(m), description: descOf(m), url: urlOf(m) }, null, 2) },
};

export function seoOpFor(id: string): SeoOp | undefined { return SEO_OPS[id]; }
export const SEO_TRIGGER = /\b(meta tags?|open ?graph|og tags?|twitter card|robots\.?txt|structured data|json-?ld|schema markup)\b/i;
