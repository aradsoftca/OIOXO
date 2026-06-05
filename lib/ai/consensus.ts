/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * consensus — cross-source agreement + FUSION. The frontier-beating step.
 *
 * A one-pass model commits to ONE narrative from memory. On-device, with the
 * user's bandwidth and no per-token cost, we can read many sources and ask them
 * to AGREE: cluster the claims that recur across INDEPENDENT domains, lead with
 * what the most sources support, add the complementary facets (so the answer is
 * as COMPLETE as the frontier's), cite, and flag the disputed / single-source
 * ones. The result is grounded (extractive — no hallucination), complete,
 * current, and cited — exactly what a cheap one-shot pass cannot reproduce.
 *
 * Two things the old loop didn't do, and why it capped below frontier:
 *   • it PICKED one draft and discarded the complementary facts in the others
 *     → here we FUSE the agreed claims into one answer;
 *   • it never counted source agreement → here CONSENSUS (distinct domains
 *     backing a claim) is a first-class ranking signal, and the citation of that
 *     agreement ("multiple sources report…") is the answer's credibility.
 *
 * Model-light by design: clustering is lexical (token Jaccard), so cross-check
 * works with NO model loaded. The trained reranker, when available, only reorders
 * the surviving claims for answer-bearing relevance (graceful lexical fallback).
 */
import type { Evidence } from './reason';
import type { AnswerPlan } from './oioxo-engine';
import { scorePassages } from './rerank';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set('the a an of to in on for and or but is are was were be been being it its this that these those with as at by from into about over under than then so such not no will can may might would should could has have had do does did your you we they he she his her their our has have'.split(' '));
function contentTokens(s: string): Set<string> {
  // keep len≥2 AND any token with a digit (cheat codes / model numbers / values
  // like "r1","a100","2001" are the distinctive answer tokens — never drop them).
  return new Set(norm(s).split(' ').filter((t) => (t.length >= 2 || /\d/.test(t)) && !STOP.has(t)));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}
/** Overlap coefficient — intersection / smaller set. Robust to paraphrases of
 *  different lengths (one source verbose, another terse), where Jaccard under-
 *  counts. We cluster on max(jaccard, overlap): two sentences are "the same
 *  claim" if either says so. */
function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const t of a) if (b.has(t)) inter++;
  return inter / Math.min(a.size, b.size);
}
function claimSim(a: Set<string>, b: Set<string>): number {
  // overlap only counts when both sentences carry enough content tokens, so a
  // short fragment fully contained in a longer one doesn't masquerade as agreement.
  const ov = Math.min(a.size, b.size) >= 4 ? overlap(a, b) : 0;
  return Math.max(jaccard(a, b), ov);
}

const domainOf = (e: Evidence): string =>
  (e.source?.site || (e.source?.url || '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0] || '').toLowerCase();

function sentences(text: string): string[] {
  return (text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [text])
    .map((s) => s.trim()).filter((s) => s.length >= 30 && s.length <= 300);
}

// Noise we never want to lead with (titles / CTAs / sales).
const CTA = /^(read more|learn|discover|need |want |looking for|here'?s|in this (article|guide|post)|view |browse|shop|compare prices|find out|see (our|the|pricing)|click)/i;
const SALES = /\b(save up to|for sale|\$\s?\d|deals?\b|near you|in stock|buy now|starting at|msrp|book now|get a quote|subscribe|sign up)\b/i;
function informative(s: string): boolean {
  if (s.length < 30 || s.length > 300) return false;
  if (/\?\s*$/.test(s)) return false;
  if (CTA.test(s) || SALES.test(s)) return false;
  if (!/[a-z]/.test(s)) return false;
  // a real claim is a multi-word clause, not a headline/label/breadcrumb. Use a
  // general shape test (enough words) rather than a verb whitelist — the whitelist
  // wrongly dropped valid declaratives like "…gives the player full health.".
  return s.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length >= 6;
}

const AUTHORITATIVE = /wikipedia\.org|britannica|\.edu\b|\.gov\b|nih\.gov|who\.int|nasa\.|nature\.com|sciencedirect|reuters|apnews|bbc\.|\.ac\.[a-z]{2}/i;

export interface Claim {
  text: string;
  domains: string[];   // distinct supporting domains (the consensus signal)
  votes: number;       // summed upvotes (forum signal)
  rel: number;         // answer-bearing relevance (reranker or lexical)
}

export interface ConsensusResult {
  text: string;
  kind: 'consensus';
  lead: Claim;
  claims: Claim[];     // fused claims used, in answer order
  domains: string[];   // all distinct domains that contributed
  agreement: number;   // distinct domains backing the lead claim
}

/**
 * Cluster every gathered sentence into CLAIMS, counting how many INDEPENDENT
 * domains support each, then fuse the agreed-upon claims into one complete,
 * cited answer. `scorer` defaults to the trained reranker (lexical fallback).
 */
export async function consensusAnswer(
  question: string,
  _plan: AnswerPlan,
  evidence: Evidence[],
  scorer: (q: string, p: string[]) => Promise<number[] | null> = scorePassages,
): Promise<ConsensusResult | null> {
  // 1. Flatten to sentence units carrying their domain + votes.
  type Unit = { s: string; tok: Set<string>; domain: string; votes: number };
  const units: Unit[] = [];
  const seenExact = new Set<string>();
  for (const e of evidence) {
    const domain = domainOf(e);
    for (const s of sentences(e.text)) {
      if (!informative(s)) continue;
      const key = norm(s).split(' ').slice(0, 10).join(' ');
      if (!key || seenExact.has(key)) continue;
      seenExact.add(key);
      units.push({ s, tok: contentTokens(s), domain, votes: Math.max(0, e.votes ?? 0) });
    }
  }
  if (!units.length) return null;

  // 2. Greedy cluster by lexical overlap. Each cluster = one CLAIM; merging a unit
  //    from a NEW domain raises the claim's agreement (the cross-check signal).
  interface Cluster { rep: Unit; members: Unit[]; domains: Set<string>; votes: number }
  const clusters: Cluster[] = [];
  const SIM = 0.5; // similarity threshold for "this is the same claim"
  for (const u of units) {
    let best: Cluster | null = null; let bestSim = -1;
    for (const c of clusters) {
      const sim = claimSim(u.tok, c.rep.tok);
      if (sim > bestSim) { bestSim = sim; best = c; }
    }
    if (best && bestSim >= SIM) {
      best.members.push(u); best.domains.add(u.domain); best.votes += u.votes;
      // keep the more complete sentence as the representative (more facets, less noise)
      if (u.s.length > best.rep.s.length && u.s.length <= 240) best.rep = u;
    } else {
      clusters.push({ rep: u, members: [u], domains: new Set([u.domain]), votes: u.votes });
    }
  }

  // 3. Answer-bearing relevance for each claim's representative (trained reranker
  //    if available; else lexical overlap with the question). One model call.
  const reps = clusters.map((c) => c.rep.s);
  const qTok = contentTokens(question);
  const rr = await scorer(question, reps).catch(() => null);
  const haveModel = !!(rr && rr.length === reps.length);
  const rel = (i: number): number =>
    haveModel ? (rr as number[])[i] : jaccard(qTok, clusters[i].rep.tok) * 6 - 1;

  // 4. Rank claims: relevance + consensus (distinct domains) + light authority/votes.
  //    Consensus is first-class — a claim two independent domains agree on outranks
  //    a slightly-more-relevant lone claim. This is the cross-check, made to count.
  const scored = clusters.map((c, i) => {
    const agree = c.domains.size;
    const authority = AUTHORITATIVE.test([...c.domains].join(' ')) ? 0.6 : 0;
    const score = rel(i) + Math.log1p(agree - 1) * 1.4 + authority + Math.log1p(c.votes) * 0.15;
    return { c, i, score, agree };
  }).sort((a, b) => b.score - a.score);

  const toClaim = (x: { c: Cluster; agree: number; i: number }): Claim => ({
    text: x.c.rep.s, domains: [...x.c.domains].filter(Boolean), votes: x.c.votes, rel: haveModel ? (rr as number[])[x.i] : 0,
  });

  const lead = toClaim(scored[0]);

  // 5. FUSE: lead + complementary facets. A facet is added only if it adds NEW
  //    information (low token-overlap with everything already chosen) — so the
  //    answer grows in coverage, not repetition. This is what makes it read as
  //    complete as a frontier answer while staying fully grounded.
  const chosen: { c: Cluster; agree: number; i: number }[] = [scored[0]];
  const usedTok = new Set(scored[0].c.rep.tok);
  for (const cand of scored.slice(1)) {
    if (chosen.length >= 4) break;
    // When the trained reranker is available, a facet must be ANSWER-BEARING
    // (positive logit) — this drops on-topic-but-irrelevant trivia (e.g. "GTA III
    // released in 2001" for a cheat-code question) that a one-pass model also
    // wouldn't volunteer. Under the model-free fallback we can't measure this, so
    // we keep the new-info rule only (degraded path).
    if (haveModel && rel(cand.i) <= 0) continue;
    const overlap = jaccard(cand.c.rep.tok, usedTok);
    if (overlap > 0.55) continue; // near-duplicate of what we already said
    chosen.push(cand);
    for (const t of cand.c.rep.tok) usedTok.add(t);
  }

  // 6. Render. Lead sentence, then complementary facets as bullets when there are
  //    several; a single strong claim stays a sentence. Citation of the AGREEMENT
  //    is the credibility ("multiple sources report" only when ≥2 domains agree).
  const allDomains = Array.from(new Set(chosen.flatMap((x) => [...x.c.domains]).filter(Boolean)));
  const leadAgree = scored[0].agree;
  // Honest labeling: a claim only ONE domain makes is marked "(one source)", so a
  // lone rumor shown next to a 3-source fact reads as exactly that — not as
  // corroboration. This is the "most sources report X; one claims Y" shape.
  const facetLabel = (x: { c: Cluster }) => (x.c.domains.size <= 1 ? '• (one source) ' : '• ');
  let body: string;
  if (chosen.length >= 3) {
    const facets = chosen.slice(1).map((x) => `${facetLabel(x)}${x.c.rep.s}`).join('\n');
    body = `${lead.text}\n\n${facets}`;
  } else {
    body = chosen.map((x) => x.c.rep.s).join(' ');
  }
  const prefix = leadAgree >= 2 ? `Across ${leadAgree} sources: ` : '';
  const claims = chosen.map(toClaim);

  return {
    text: `${prefix}${body}`.trim(),
    kind: 'consensus',
    lead, claims, domains: allDomains, agreement: leadAgree,
  };
}
