/**
 * Pure text utilities shared by text tools.
 */

export function splitWords(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function toSentenceCase(s: string): string {
  const lower = s.toLowerCase();
  // Capitalize first letter of each sentence
  return lower.replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, (m) => m.toUpperCase());
}

export function toCamelCase(s: string): string {
  const w = splitWords(s);
  return w.map((p, i) =>
    i === 0 ? p.toLowerCase() : p[0].toUpperCase() + p.slice(1).toLowerCase(),
  ).join('');
}

export function toPascalCase(s: string): string {
  return splitWords(s).map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join('');
}

export function toSnakeCase(s: string): string {
  return splitWords(s).map((p) => p.toLowerCase()).join('_');
}

export function toKebabCase(s: string): string {
  return splitWords(s).map((p) => p.toLowerCase()).join('-');
}

export function rot13(s: string): string {
  return s.replace(/[a-zA-Z]/g, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
  });
}

const HTML_ENT: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

export function htmlEncode(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ENT[c]);
}

export function htmlDecode(s: string): string {
  const map: Record<string, string> = {
    'amp': '&', 'lt': '<', 'gt': '>', 'quot': '"', 'apos': "'", '#39': "'", 'nbsp': ' ',
  };
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, name: string) => {
    const lower = name.toLowerCase();
    // String.fromCodePoint throws RangeError on values outside [0, 0x10FFFF].
    // A malicious input like `&#x10FFFFFF;` would otherwise crash the entire
    // conversion. Clamp + finite-check and fall back to the literal entity.
    const safeCodePoint = (n: number) => {
      if (!Number.isFinite(n) || n < 0 || n > 0x10FFFF) return m;
      try { return String.fromCodePoint(n); } catch { return m; }
    };
    if (lower.startsWith('#x')) return safeCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith('#'))  return safeCodePoint(parseInt(lower.slice(1), 10));
    return map[lower] ?? m;
  });
}

// Regex extractors used by extract-* tools.
export const EXTRACTORS = {
  email:   /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  url:     /\bhttps?:\/\/[^\s<>"']+/gi,
  number:  /-?\d+(?:[.,]\d+)?/g,
  // Loosely match common phone patterns; tolerant on purpose.
  phone:   /\+?\d[\d\s().-]{6,}\d/g,
  hashtag: /(?:^|\s)(#[A-Za-z0-9_]{1,80})\b/g,
  mention: /(?:^|\s)(@[A-Za-z0-9_]{1,80})\b/g,
};

export function extract(s: string, kind: keyof typeof EXTRACTORS, unique = true): string[] {
  const re = new RegExp(EXTRACTORS[kind].source, EXTRACTORS[kind].flags);
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const value = m[1] ?? m[0];
    matches.push(value.trim());
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return unique ? Array.from(new Set(matches)) : matches;
}

// Flesch reading ease
export function readability(text: string): { score: number; grade: string } {
  const sentences = Math.max(1, (text.match(/[.!?]+/g) ?? []).length);
  const wordList = text.match(/\b[\w']+\b/g) ?? [];
  const words = Math.max(1, wordList.length);
  const syllables = wordList.reduce((n, w) => n + countSyllables(w), 0);
  const score = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
  let grade = 'Very confusing';
  if (score >= 90) grade = '5th grade · very easy';
  else if (score >= 80) grade = '6th grade · easy';
  else if (score >= 70) grade = '7th grade · fairly easy';
  else if (score >= 60) grade = '8–9th grade · plain';
  else if (score >= 50) grade = '10–12th grade · fairly hard';
  else if (score >= 30) grade = 'College · hard';
  return { score: Math.round(score * 10) / 10, grade };
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}
