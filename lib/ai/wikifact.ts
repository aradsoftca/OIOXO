/**
 * wikifact — exact factoid answers from Wikidata (CORS-open, no key, works in the
 * browser AND Node). The chat engine's encyclopedic-lead path fails on factoids
 * whose top Wikipedia article is an ambiguity/list page ("capital of japan" → the
 * "Capital of Japan" legal-debate article, whose lead never says "Tokyo"). Wikidata
 * gives the VALUE directly via the entity's property claim — exact, fast, language-
 * independent. This is the chat-side mirror of search.html's tryDirectAnswer.
 *
 * Scope = the high-frequency "PROPERTY of SUBJECT" factoids. Returns a clean answer
 * sentence + the Wikidata source, or null (caller falls through to the normal flow).
 */

// question keyword → Wikidata property + how to render the value.
type Kind = 'entity' | 'quantity' | 'time';
interface Prop { pid: string; kind: Kind; label: (subj: string, val: string) => string; }
const PROPS: [RegExp, Prop][] = [
  [/\bcapital\b/i,        { pid: 'P36',   kind: 'entity',   label: (s, v) => `The capital of ${s} is ${v}.` }],
  [/\bpopulation\b/i,     { pid: 'P1082', kind: 'quantity', label: (s, v) => `${s} has a population of about ${v}.` }],
  [/\bcurrency\b/i,       { pid: 'P38',   kind: 'entity',   label: (s, v) => `The currency of ${s} is the ${v}.` }],
  [/\bcontinent\b/i,      { pid: 'P30',   kind: 'entity',   label: (s, v) => `${s} is in ${v}.` }],
  [/\b(official language|languages?)\b/i, { pid: 'P37', kind: 'entity', label: (s, v) => `The official language of ${s} is ${v}.` }],
  [/\barea\b/i,           { pid: 'P2046', kind: 'quantity', label: (s, v) => `${s} has an area of about ${v} km².` }],
  [/\b(president|head of state)\b/i,      { pid: 'P35',  kind: 'entity', label: (s, v) => `The head of state of ${s} is ${v}.` }],
  [/\b(prime minister|head of government)\b/i, { pid: 'P6', kind: 'entity', label: (s, v) => `The head of government of ${s} is ${v}.` }],
  [/\b(founded|inception|established|created)\b/i, { pid: 'P571', kind: 'time', label: (s, v) => `${s} was founded in ${v}.` }],
  [/\bcapital city\b/i,   { pid: 'P36',   kind: 'entity',   label: (s, v) => `The capital of ${s} is ${v}.` }],
];

const WIKI_UA = { 'Api-User-Agent': 'oioxo/1.0 (https://oioxo.com)' };
async function wd<T = any>(url: string): Promise<T | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  try { const r = await fetch(url, { cache: 'no-store', headers: WIKI_UA }); return r.ok ? await r.json() : null; } catch { return null; }
}

/** Parse "PROPERTY of SUBJECT" (and "who is the president of SUBJECT", "SUBJECT's
 *  capital"). Returns the matched property + the subject text, or null. */
function parse(q: string): { prop: Prop; subject: string } | null {
  const t = q.trim().replace(/[?.!]+$/, '');
  for (const [re, prop] of PROPS) {
    if (!re.test(t)) continue;
    // "... of <subject>"
    let m = t.match(/\bof\s+(.+)$/i);
    // "<subject>'s capital" / "<subject> capital"
    if (!m) m = t.match(/^(?:what(?:'s| is)?(?: the)?|who(?:'s| is)?(?: the)?)?\s*(.+?)(?:'s)?\s+(?:capital|population|currency|continent|area|president|prime minister)\b/i);
    const subject = (m?.[1] || '').replace(/^the\s+/i, '').trim();
    if (subject && subject.length >= 2 && subject.split(/\s+/).length <= 5) return { prop, subject };
  }
  return null;
}

async function resolveQid(subject: string): Promise<string | null> {
  const j = await wd(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(subject)}&language=en&format=json&limit=1&origin=*`);
  const id = j?.search?.[0]?.id;
  return /^Q\d+$/.test(id || '') ? id : null;
}

async function labelOf(qid: string): Promise<string | null> {
  const j = await wd(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=labels&languages=en&format=json&origin=*`);
  return j?.entities?.[qid]?.labels?.en?.value || null;
}

/** Try to answer a "PROPERTY of SUBJECT" factoid from Wikidata. null = no match. */
export async function wikiFact(query: string): Promise<{ text: string; source: { title: string; url: string; site: string } } | null> {
  const p = parse(query);
  if (!p) return null;
  const qid = await resolveQid(p.subject);
  if (!qid) return null;
  const j = await wd(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims|labels&languages=en&format=json&origin=*`);
  const ent = j?.entities?.[qid];
  if (!ent) return null;
  const subjLabel = ent.labels?.en?.value || p.subject;
  // Multi-value properties (capital/population over time) carry historical entries.
  // Pick the CURRENT one: preferred rank first, else a value with no end-time (P582)
  // qualifier, and for time-series prefer the latest point-in-time (P585). Taking
  // [0] blindly returns a historical capital (Japan→Shigaraki Palace) — wrong.
  const claims: any[] = ent.claims?.[p.prop.pid] || []; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!claims.length) return null;
  const current = claims.filter((c) => !c.qualifiers?.P582 && c.rank !== 'deprecated');
  const pool = current.length ? current : claims;
  const preferred = pool.filter((c) => c.rank === 'preferred');
  const cand = (preferred.length ? preferred : pool).slice();
  // For a time-series (population), the newest point-in-time wins.
  cand.sort((a, b) => {
    const ay = +(String(a.qualifiers?.P585?.[0]?.datavalue?.value?.time || '').match(/[+-](\d{1,4})/)?.[1] || 0);
    const by = +(String(b.qualifiers?.P585?.[0]?.datavalue?.value?.time || '').match(/[+-](\d{1,4})/)?.[1] || 0);
    return by - ay;
  });
  const claim = cand[0]?.mainsnak?.datavalue;
  if (!claim) return null;
  let value: string | null = null;
  if (p.prop.kind === 'entity' && claim.type === 'wikibase-entityid') {
    value = await labelOf('Q' + claim.value['numeric-id']);
  } else if (p.prop.kind === 'quantity' && claim.type === 'quantity') {
    const n = Math.abs(parseFloat(claim.value.amount));
    value = n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} million` : n.toLocaleString('en-US');
  } else if (p.prop.kind === 'time' && claim.type === 'time') {
    const y = String(claim.value.time).match(/[+-](\d{1,4})/); value = y ? y[1].replace(/^0+/, '') : null;
  }
  if (!value) return null;
  return {
    text: p.prop.label(subjLabel, value),
    source: { title: subjLabel + ' — Wikidata', url: `https://www.wikidata.org/wiki/${qid}`, site: 'wikidata.org' },
  };
}
