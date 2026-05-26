/**
 * check-ops — the AI does common TEST/CHECK/VALIDATE jobs INLINE, live in chat,
 * instead of sending the user to a tool page. Deterministic + instant (like
 * compute.ts): email/URL/IP/credit-card/JSON validity, password strength. The
 * heavier live checks (is-a-site-down, my-IP, DNS, SSL, ping) route to the existing
 * net-* tools; this covers the ones a tiny floor nails perfectly and instantly.
 *
 * Returns a ready answer string, or null when the text isn't a check request.
 * Pure / Node-testable; gated on an explicit check intent to avoid false positives.
 */

// Loose check-intent keyword anywhere; each check's own subject+data-shape guards
// stop false fires ("valid point" / "check it out" → no subject → null).
const INTENT = /\b(valid|invalid|correct(ly)?|legit(imate)?|strong|weak|secure|check|validate|verify|how strong|test if|tell me if|is it (real|right))\b/i;

const isEmail = (s: string) => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(s);
const isIPv4 = (s: string) => /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(s) && s.split('.').every((n) => +n <= 255);
const isIPv6 = (s: string) => /^(([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,7}:|::([0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})$/i.test(s);

function luhn(num: string): boolean {
  const d = num.replace(/[\s-]/g, '');
  if (!/^\d{12,19}$/.test(d)) return false;
  let sum = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = +d[i];
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}
function cardBrand(num: string): string {
  const d = num.replace(/[\s-]/g, '');
  if (/^4/.test(d)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard';
  if (/^3[47]/.test(d)) return 'American Express';
  if (/^(6011|65|64[4-9])/.test(d)) return 'Discover';
  if (/^3(0[0-5]|[68])/.test(d)) return 'Diners Club';
  return 'card';
}

function passwordScore(pw: string): string {
  const common = new Set(['password', '123456', '12345678', 'qwerty', 'abc123', 'password1', 'letmein', '111111', 'iloveyou', 'admin', '123456789']);
  if (common.has(pw.toLowerCase())) return `**${pw.length < 24 ? pw : 'that'}** is **very weak** — it's one of the most common passwords. Use a longer mix of words, numbers and symbols.`;
  let bits = 0;
  if (pw.length >= 8) bits++;
  if (pw.length >= 12) bits++;
  if (pw.length >= 16) bits++;
  if (/[a-z]/.test(pw)) bits++;
  if (/[A-Z]/.test(pw)) bits++;
  if (/\d/.test(pw)) bits++;
  if (/[^a-zA-Z0-9]/.test(pw)) bits++;
  const label = bits <= 2 ? 'weak' : bits <= 4 ? 'fair' : bits <= 5 ? 'strong' : 'very strong';
  const tips: string[] = [];
  if (pw.length < 12) tips.push('make it longer (12+)');
  if (!/[A-Z]/.test(pw) || !/[a-z]/.test(pw)) tips.push('mix upper & lower case');
  if (!/\d/.test(pw)) tips.push('add numbers');
  if (!/[^a-zA-Z0-9]/.test(pw)) tips.push('add a symbol');
  return `That password looks **${label}**${tips.length ? ` — to improve it, ${tips.join(', ')}.` : ' — nicely done.'}`;
}

export function tryCheck(text: string): string | null {
  const t = text.trim();
  if (!INTENT.test(t)) return null;

  // JSON validity (a {...} or [...] block present)
  if (/\bjson\b/i.test(t)) {
    const block = t.match(/[{[][\s\S]*[}\]]/);
    if (block) {
      try { JSON.parse(block[0]); return '✓ That **is valid JSON** — it parses cleanly.'; }
      catch (e: any) { return `✗ That **isn't valid JSON**: ${String(e.message).replace(/\s+/g, ' ').slice(0, 80)}.`; }
    }
  }

  // PASSWORD strength: "how strong is <pw>", "check password <pw>", "is <pw> strong"
  let m = t.match(/(?:password|passcode|how strong is|strength of)\s*(?:is|:)?\s*["']?(\S{3,64})["']?\s*$/i)
       || t.match(/\bis\s+["']?(\S{3,64})["']?\s+(?:a\s+)?(?:strong|weak|good|secure)\s+password/i);
  if (m && /\b(password|passcode|strong|weak|secure)\b/i.test(t)) return passwordScore(m[1]);

  // EMAIL: a token that looks like an email + email/valid intent
  m = t.match(/([^\s@<>()]+@[^\s@<>()]+)/);
  if (m && /\b(email|e-mail|address)\b/i.test(t)) {
    const e = m[1].replace(/[.,;]$/, '');
    return isEmail(e) ? `✓ **${e}** is a valid email address (correct format).` : `✗ **${e}** is **not** a valid email address — check the format (name@domain.tld).`;
  }

  // CREDIT CARD (Luhn): a 12-19 digit run + card intent
  m = t.match(/\b((?:\d[ -]?){12,19})\b/);
  if (m && /\b(card|credit|debit|luhn)\b/i.test(t)) {
    const num = m[1].replace(/[\s-]/g, '');
    return luhn(num) ? `✓ **${num.slice(0, 4)}…${num.slice(-4)}** passes the Luhn check — a valid ${cardBrand(num)} number format. (This only checks the format, not that the card is active.)`
                     : `✗ That number **fails the Luhn check** — it isn't a valid card number.`;
  }

  // URL
  m = t.match(/\bhttps?:\/\/\S+/i) || (/(\burl\b|\blink\b)/i.test(t) ? t.match(/\b([a-z0-9-]+\.[a-z]{2,}(?:\/\S*)?)\b/i) : null);
  if (m && /\b(url|link|website|address)\b/i.test(t)) {
    const u = m[0].replace(/[.,;]$/, '');
    try { new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u); return `✓ **${u}** is a valid URL (well-formed). I can't fetch it from here, but the format is correct.`; }
    catch { return `✗ **${u}** isn't a well-formed URL.`; }
  }

  // IP address
  m = t.match(/\b([0-9a-f:.]{2,45})\b/i);
  if (m && /\bip\b/i.test(t) && (isIPv4(m[1]) || isIPv6(m[1]) || /\d/.test(m[1]))) {
    const ip = m[1];
    if (isIPv4(ip)) return `✓ **${ip}** is a valid IPv4 address.`;
    if (isIPv6(ip)) return `✓ **${ip}** is a valid IPv6 address.`;
    return `✗ **${ip}** is not a valid IP address.`;
  }

  return null;
}
