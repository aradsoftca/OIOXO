/**
 * oioxo Agentic IDE (AGENTIC_IDE.md §5) — the model glue for the orchestrator.
 * Turns the goal + current files into an ordered plan by asking the on-device
 * coder, then parses it with the pure `parsePlan`. Lives apart from agent.ts so
 * the orchestration stays pure/testable and only this thin layer touches the
 * model runtime.
 */
import { chatStream } from './runtime';
import { parsePlan, type PlanFn } from './agent';

/** Build a PlanFn backed by the on-device coder (web-llm `match`). */
export function makePlanner(
  match: string[],
  opts?: { maxTokens?: number; onProgress?: (p: number) => void },
): PlanFn {
  return async (goal, files) => {
    const fileList = files.length ? files.map((f) => f.path).join(', ') : '(empty project)';
    let acc = '';
    for await (const delta of chatStream(
      match,
      [
        {
          role: 'system',
          content:
            'You are a senior engineer planning a build inside oioxo. Given a goal and the ' +
            'current files, output a SHORT ordered plan as a JSON array of 2–6 step strings. ' +
            'Each step is ONE concrete, verifiable change that leaves the project runnable ' +
            '(e.g. "Add the HTML structure for the timer", "Implement start/pause logic in script.js"). ' +
            'Reply with the JSON array ONLY — no prose, no code fences.',
        },
        {
          role: 'user',
          content: `Goal: ${goal}\nCurrent files: ${fileList}\n\nReturn the plan as a JSON array of step strings.`,
        },
      ],
      { maxTokens: opts?.maxTokens ?? 320, onProgress: opts?.onProgress },
    )) {
      acc += delta;
    }
    return parsePlan(acc);
  };
}
