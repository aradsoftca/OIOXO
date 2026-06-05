/**
 * Smart numeric parser — when a query is just a number (or close to it),
 * try to detect what KIND of number it is so we surface a richer card
 * than the generic "see web results" fallback.
 *
 * Detected forms:
 *   - Year   (1900-2099)
 *   - Phone  (10-15 digits, dashes/parens/spaces tolerated)
 *   - IPv4   (a.b.c.d)
 *   - IPv6   (:: notation)
 *   - Hex    ("0x..." or 6/8 hex digits = colour)
 *   - Binary ("0b..." or all 0/1 with length ≥4)
 *   - Scientific ("1e6", "2.5e-3")
 *   - Phone-like prefix codes ("+44", "+1")
 *   - ZIP code (5 digits — US)
 *   - Postcode (UK letter-number mix)
 *
 *   tryCard(query) → intent card or null
 *
 * Exposes window.oioxoNumparse = { tryCard, classify }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoNumparse) return;

  function classify(query){
    if (!query) return null;
    const q = String(query).trim();
    if (!q) return null;

    // IPv4
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(q)){
      const parts = q.split('.');
      if (parts.every((p) => +p >= 0 && +p <= 255)) return { kind: 'ipv4', value: q };
    }
    // IPv6 (loose)
    if (/^([0-9a-f]{1,4}:){2,}[0-9a-f]{0,4}$/i.test(q)) return { kind: 'ipv6', value: q };

    // Hex colour (#RRGGBB, RRGGBBAA, or just 6 hex digits)
    if (/^#[0-9a-f]{3,8}$/i.test(q)) return { kind: 'hex-color', value: q };
    if (/^[0-9a-f]{6}$/i.test(q) && /[a-f]/i.test(q)) return { kind: 'hex-color', value: '#' + q };

    // Hex literal
    if (/^0x[0-9a-f]+$/i.test(q)){
      const dec = parseInt(q, 16);
      return { kind: 'hex', value: q, decimal: dec };
    }
    // Binary literal
    if (/^0b[01]+$/i.test(q)){
      const dec = parseInt(q.slice(2), 2);
      return { kind: 'binary', value: q, decimal: dec };
    }
    // Bare binary (all 0/1, length 4-16)
    if (/^[01]{4,16}$/.test(q)){
      const dec = parseInt(q, 2);
      return { kind: 'binary', value: q, decimal: dec };
    }

    // Scientific notation
    if (/^-?\d+(\.\d+)?e-?\d+$/i.test(q)){
      const dec = parseFloat(q);
      return { kind: 'scientific', value: q, decimal: dec };
    }

    // Phone with country prefix
    if (/^\+\d{1,3}[\s\-\(\)\d]{6,}$/.test(q)){
      return { kind: 'phone', value: q, digits: q.replace(/\D/g, '') };
    }

    // US ZIP / 5-digit
    if (/^\d{5}(-\d{4})?$/.test(q)) return { kind: 'zip', value: q };

    // UK postcode
    if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(q)) return { kind: 'uk-postcode', value: q };

    // Year (4 digits, 1000-3000)
    if (/^[12]\d{3}$/.test(q)){
      return { kind: 'year', value: +q };
    }

    // Plain integer / decimal
    if (/^-?\d+(\.\d+)?$/.test(q)){
      const n = parseFloat(q);
      return { kind: 'number', value: n };
    }

    return null;
  }

  function colourPreviewHex(q){
    // Normalise to #RRGGBB.
    let h = q.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length === 8) h = h.slice(0, 6); // ignore alpha
    return '#' + h.toUpperCase();
  }

  async function tryCard(query){
    const c = classify(query);
    if (!c) return null;
    const base = { kind: 'numparse', icon: '🔢', confidence: 0.7, inputType: 'none' };
    switch (c.kind){
      case 'ipv4':
      case 'ipv6':
        return Object.assign({}, base, {
          title: 'IP address',
          formatted: c.value,
          summary: c.kind === 'ipv4' ? 'IPv4 address' : 'IPv6 address',
        });
      case 'hex-color':
        return Object.assign({}, base, {
          title: 'Colour',
          formatted: colourPreviewHex(c.value),
          colorPreview: colourPreviewHex(c.value),
          summary: 'Hex colour (preview)',
        });
      case 'hex':
        return Object.assign({}, base, {
          title: 'Hex literal',
          formatted: c.value + ' = ' + c.decimal + ' (decimal)',
          summary: 'Hexadecimal number',
        });
      case 'binary':
        return Object.assign({}, base, {
          title: 'Binary',
          formatted: c.value + ' = ' + c.decimal + ' (decimal)',
          summary: 'Binary number',
        });
      case 'scientific':
        return Object.assign({}, base, {
          title: 'Scientific notation',
          formatted: c.value + ' = ' + c.decimal.toLocaleString(),
          summary: 'Scientific notation',
        });
      case 'phone':
        return Object.assign({}, base, {
          title: 'Phone number',
          formatted: c.value,
          summary: 'Phone number (' + c.digits.length + ' digits)',
        });
      case 'zip':
        return Object.assign({}, base, {
          title: 'US ZIP code',
          formatted: c.value,
          summary: 'US ZIP code',
        });
      case 'uk-postcode':
        return Object.assign({}, base, {
          title: 'UK postcode',
          formatted: c.value.toUpperCase(),
          summary: 'UK postcode',
        });
      case 'year':
        return Object.assign({}, base, {
          title: 'Year ' + c.value,
          formatted: String(c.value),
          summary: 'Year ' + c.value + ' — ' + (new Date().getFullYear() - c.value) + ' years ago',
        });
      case 'number':
        // Only show a card if the number is "interesting" — formatted
        // with commas, mention common interpretations.
        return Object.assign({}, base, {
          title: 'Number',
          formatted: c.value.toLocaleString(),
          summary: 'Plain number',
          confidence: 0.4,
        });
    }
    return null;
  }

  window.oioxoNumparse = { tryCard, classify };
})();
