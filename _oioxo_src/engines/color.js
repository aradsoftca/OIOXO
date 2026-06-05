/**
 * oioxo engine: color parser + format converter + WCAG contrast.
 *
 * Pure on-device. Uses the off-screen canvas fillStyle round-trip to let the
 * browser resolve hex / rgb() / hsl() / named CSS colors without a curated
 * table — same trick the xonvert app/generators/color-converter page can
 * adopt so both surfaces share the parser.
 *
 * Exposes window.oioxoEngines.color = { parse, toHex, toRgb, toHsl, contrast }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoEngines = window.oioxoEngines || {};
  if (window.oioxoEngines.color) return;

  const SHORT_WORD_BLOCK = /^(api|sdk|cli|css|html|json|http|war|tax|day|man|new|old|key|bin|app|web|url|dns|tcp)$/i;

  function parse(input){
    if (!input || typeof input !== 'string') return null;
    const cleaned = input.trim().replace(/^color\s+/i, '').replace(/^css\s+/i, '').trim();
    if (!cleaned) return null;
    const isHex = /^#?[0-9a-f]{3,8}$/i.test(cleaned);
    const isFn  = /^(?:rgb|rgba|hsl|hsla)\s*\(/i.test(cleaned);
    const isName = /^[a-z]+$/i.test(cleaned) && cleaned.length >= 3 && cleaned.length <= 22;
    if (!isHex && !isFn && !isName) return null;
    if (isName && SHORT_WORD_BLOCK.test(cleaned)) return null;
    try {
      const c = document.createElement('canvas');
      c.width = 1; c.height = 1;
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#000';
      ctx.fillStyle = cleaned;
      // If unknown, the browser leaves fillStyle as '#000000'. Allow legitimate
      // black inputs through.
      if (ctx.fillStyle === '#000000' && !/^(#000(?:000)?|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))$/i.test(cleaned)) return null;
      ctx.fillRect(0, 0, 1, 1);
      const px = ctx.getImageData(0, 0, 1, 1).data;
      return { r: px[0], g: px[1], b: px[2], a: px[3] / 255 };
    } catch { return null; }
  }

  function toHex(rgb){
    if (!rgb) return null;
    return '#' + [rgb.r, rgb.g, rgb.b].map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  function toRgb(rgb){
    if (!rgb) return null;
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  }
  function toHsl(rgb){
    if (!rgb) return null;
    const rN = rgb.r / 255, gN = rgb.g / 255, bN = rgb.b / 255;
    const mx = Math.max(rN, gN, bN), mn = Math.min(rN, gN, bN);
    let h = 0, s = 0;
    const l = (mx + mn) / 2;
    if (mx !== mn){
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === rN) h = ((gN - bN) / d + (gN < bN ? 6 : 0));
      else if (mx === gN) h = (bN - rN) / d + 2;
      else h = (rN - gN) / d + 4;
      h *= 60;
    }
    return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
  }
  function relativeLuminance(rgb){
    const lum = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * lum(rgb.r) + 0.7152 * lum(rgb.g) + 0.0722 * lum(rgb.b);
  }
  function contrast(rgb){
    if (!rgb) return null;
    const L = relativeLuminance(rgb);
    const onBlack = (L + 0.05) / 0.05;
    const onWhite = (1 + 0.05) / (L + 0.05);
    return {
      onBlack: Math.round(onBlack * 100) / 100,
      onWhite: Math.round(onWhite * 100) / 100,
      preferredText: L > 0.5 ? '#000' : '#fff',
    };
  }

  window.oioxoEngines.color = { parse, toHex, toRgb, toHsl, contrast, relativeLuminance };
})();
