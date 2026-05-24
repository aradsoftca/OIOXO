/**
 * Xonvert AI — the brain controller (PLAN + ACT decision).
 *
 * Turns a Goal (from the UNDERSTAND stage) into ONE decision, by combining the
 * two deterministic strengths:
 *   - the Capability Graph — for cross-family goals, including ones no single
 *     tool serves ("mp3 → bmp" = waveform → convert), discovered by path-finding;
 *   - retrieval — for action-named, single-family jobs ("compress this",
 *     "remove background") where a keyword names the tool directly.
 *
 * The decision falls out of WHETHER A ROUTE EXISTS — not a brittle intent regex:
 *   transform/create + route found → run it (tool or chain)
 *   assist                         → offer help (ask for the file)
 *   answer                         → search & answer (in the user's language)
 *   chat                           → talk
 *   do-but-no-route                → search fallback, so we're never a dead end
 *
 * Pure / Node-testable. It DECIDES; `AiApp` owns the engines that EXECUTE.
 */

import type { Goal } from './goal';
import { planCapability, wordFamily, type Family, type GraphNodeKey } from './capability-graph';
import { planJob, type JobPlan } from './job';
import { searchTools, confidence as lexConfidence } from './retrieval';

export type BrainDecision =
  | { kind: 'chat'; lang: string }
  | { kind: 'search'; query: string; lang: string }
  | { kind: 'assist'; family: Family | null; lang: string }
  | { kind: 'tool'; toolId: string; targetFormat?: string; lang: string }
  | { kind: 'chain'; toolIds: string[]; families: GraphNodeKey[]; targetFormat?: string; lang: string }
  | { kind: 'job'; plan: JobPlan; lang: string };

export interface BrainCtx {
  message: string;
  hasFile?: boolean;
  fileFamily?: Family | null;
}

/** File-category hint the retrieval ranker understands (others → no filter). */
function searchCategory(f: Family | null | undefined): 'image' | 'audio' | 'video' | 'pdf' | 'text' | null {
  return f === 'image' || f === 'audio' || f === 'video' || f === 'pdf' || f === 'text' ? f : null;
}

/** The retrieval top match + whether it's trustworthy enough to act on. */
function retrieve(message: string, fileFamily: Family | null) {
  const cat = searchCategory(fileFamily);
  const ranked = searchTools(message, { fileCategory: cat, limit: 5 });
  return { top: ranked[0] ?? null, confidence: lexConfidence(ranked) };
}

/**
 * Decide what to do for a Goal. `from` for path-finding is the attached file's
 * family when present (most reliable), else the family named in the request.
 */
export function decideBrain(goal: Goal, ctx: BrainCtx): BrainDecision {
  const lang = goal.lang;

  if (goal.intent === 'chat') return { kind: 'chat', lang };

  // A composition JOB — "write a detailed article about X, with images, as a
  // PDF, read it aloud". Checked before the simple branches: it spans research +
  // long-form writing + media production no single tool/answer covers. Gated on
  // NO file (jobs are generative-from-scratch) rather than intent — a job that
  // also says "as a pdf" gets intent=transform from the format word, which must
  // NOT suppress it. With a file in hand, it's a tool op, so we skip.
  if (!ctx.fileFamily) {
    const job = planJob(goal, ctx.message);
    if (job) return { kind: 'job', plan: job, lang };
  }

  if (goal.intent === 'answer') return { kind: 'search', query: goal.subject || ctx.message, lang };
  if (goal.intent === 'assist') return { kind: 'assist', family: ctx.fileFamily ?? goal.from, lang };

  // transform / create — this is a DO. Resolve a route.
  const from: GraphNodeKey | null = ctx.fileFamily ?? goal.from ?? (goal.intent === 'create' ? 'nothing' : null);

  // 1) Cross-family transform → the Capability Graph (handles multi-hop the
  //    keyword router can't, e.g. audio→image→bmp). Only when the goal endpoints
  //    point at DIFFERENT families; same-family edits go to retrieval below.
  if (goal.to) {
    const toFam = wordFamily(goal.to);
    if (toFam && from && toFam !== from) {
      const path = planCapability(from, goal.to);
      if (path) {
        const toolIds = path.edges.map((e) => e.toolId);
        const targetFormat = goal.to;
        if (toolIds.length === 1) return { kind: 'tool', toolId: toolIds[0], targetFormat, lang };
        return { kind: 'chain', toolIds, families: path.families, targetFormat, lang };
      }
    }
  }

  // 2) Action-named / same-family job → retrieval picks the single tool.
  const { top, confidence } = retrieve(ctx.message, ctx.fileFamily ?? null);
  if (top && confidence !== 'weak') return { kind: 'tool', toolId: top.doc.id, lang };

  // 3) A "create" with no confident tool but a clear output family → try the
  //    graph from scratch (a generator producing that family).
  if (goal.intent === 'create' && goal.to) {
    const path = planCapability('nothing', goal.to);
    if (path) {
      const toolIds = path.edges.map((e) => e.toolId);
      return toolIds.length === 1
        ? { kind: 'tool', toolId: toolIds[0], lang }
        : { kind: 'chain', toolIds, families: path.families, lang };
    }
  }

  // 4) No route anywhere → don't dead-end: look it up and answer.
  return { kind: 'search', query: goal.subject || ctx.message, lang };
}
