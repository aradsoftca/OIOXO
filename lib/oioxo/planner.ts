/**
 * oioxo Agentic IDE (AGENTIC_IDE.md §5) — the model glue for the orchestrator.
 * Turns the goal + current files into an ordered plan by asking the on-device
 * coder, then parses it with the pure `parsePlan`. Lives apart from agent.ts so
 * the orchestration stays pure/testable and only this thin layer touches the
 * model runtime.
 */
import { parsePlan, type PlanFn } from './agent';
import { runRole } from './conductor-engine';
import type { CodeFile } from './codeloop';

/** A compact digest of the current files (paths + a content head each), capped so
 *  the planner is GROUNDED in what already exists without blowing the context. */
function filesDigest(files: CodeFile[], budget = 1800): string {
  if (!files.length) return '(empty project)';
  const per = Math.max(120, Math.floor(budget / files.length));
  const parts: string[] = [];
  let used = 0;
  for (const f of files) {
    const head = f.content.split('\n').slice(0, 12).join('\n').slice(0, per);
    const block = `--- ${f.path} ---\n${head}`;
    if (used + block.length > budget) { parts.push(`… (+${files.length - parts.length} more files)`); break; }
    parts.push(block);
    used += block.length;
  }
  return parts.join('\n');
}

/** Build a PlanFn backed by the on-device coder (web-llm `match`) — or, when a
 *  `chat` override is supplied (e.g. the user's frontier key), by that model. */
export function makePlanner(
  match: string[],
  opts?: {
    maxTokens?: number;
    onProgress?: (p: number) => void;
    onToken?: (delta: string) => void;
    chat?: (system: string, user: string) => Promise<string>;
  },
): PlanFn {
  const system =
    'You are a senior engineer planning a build inside oioxo. Begin with ONE short ' +
    'sentence describing your approach, then output a SHORT ordered plan as a JSON ' +
    'array of 2–6 step strings. Each step is ONE concrete, verifiable change that ' +
    'leaves the project runnable (e.g. "Add the HTML structure for the timer", ' +
    '"Implement start/pause logic in index.html"). After the sentence, the JSON array only.';
  return async (goal, files) => {
    const digest = filesDigest(files);
    const user =
      `Goal: ${goal}\n\nThe project already has these files (heads shown):\n${digest}\n\n` +
      'Briefly state your approach, then return the plan as a JSON array of step strings.';
    // Frontier key (BYOK) → that model; else conductor-when-entitled, else coder.
    const acc = opts?.chat
      ? await opts.chat(system, user)
      : await runRole('plan', system, user, match, { maxTokens: opts?.maxTokens ?? 360, onProgress: opts?.onProgress, onToken: opts?.onToken });
    return parsePlan(acc);
  };
}
