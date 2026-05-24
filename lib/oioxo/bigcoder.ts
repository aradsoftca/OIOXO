/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo Code P5 — the OPTIONAL bigger coder (OIOXO_CODE.md §4: "optional bigger
 * downloaded coder"). The small WebGPU coder is the default; when the user runs a
 * full local model server (Ollama) on their own machine, the SAME execute→repair
 * loop can be driven by a 7B–32B coder for a stronger one-shot — still fully on
 * the user's device, still proven by the device's oracle, never our servers.
 *
 * This is a drop-in `GenerateFn`: it reuses the exact prompt + edit-parsing of the
 * small coder (codegen.ts), only swapping where generation runs. Detection +
 * request shaping are Node-testable with an injected fetch; the live call just
 * needs Ollama reachable at localhost.
 */
import type { Edit, GenContext, GenerateFn } from './codeloop';
import { buildPrompt, parseEdits } from './codegen';
import { retrieveContext } from './retrieve';

const SYSTEM =
  'You are an expert coding agent. Make the SMALLEST change that satisfies the task ' +
  'or fixes the error. Output ONLY the files you create or change — each as a fenced ' +
  'code block whose info line is the file PATH, e.g.\n```src/add.js\n<contents>\n```\nNo prose.';

const DEFAULT_BASE = 'http://localhost:11434';

type Fetcher = typeof fetch;

export interface OllamaInfo {
  base: string;
  /** Installed coder-capable models (ids), best first. */
  models: string[];
}

/** Probe a local Ollama server and list its models (coder models surfaced first).
 *  Returns null if none is reachable — the UI then just offers the small coder. */
export async function detectOllama(base = DEFAULT_BASE, fetcher: Fetcher = fetch): Promise<OllamaInfo | null> {
  try {
    const r = await fetcher(`${base}/api/tags`);
    if (!r.ok) return null;
    const j: any = await r.json();
    const all: string[] = (j?.models ?? []).map((m: any) => m?.name).filter(Boolean);
    if (!all.length) return null;
    const isCoder = (n: string) => /cod(er|e)|qwen|deepseek|starcoder|granite/i.test(n);
    const models = [...all.filter(isCoder), ...all.filter((n) => !isCoder(n))];
    return { base, models };
  } catch {
    return null;
  }
}

/**
 * A GenerateFn backed by a local Ollama model. Same grounded prompt as the small
 * coder (retrieval + grabbed external APIs), parsed the same way — so the loop is
 * identical; only the writer is bigger.
 */
export function makeOllamaGenerate(
  model: string,
  opts: { base?: string; fetch?: Fetcher; getExtApis?: () => string; temperature?: number } = {},
): GenerateFn {
  const base = opts.base ?? DEFAULT_BASE;
  const fetcher = opts.fetch ?? fetch;
  return async (ctx: GenContext): Promise<Edit[]> => {
    const retrieved = await retrieveContext(ctx.task, ctx.files).catch(() => undefined);
    const r = await fetcher(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: opts.temperature ?? (ctx.attempt === 0 ? 0.3 : 0.2) },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: buildPrompt(ctx, retrieved, opts.getExtApis?.()) },
        ],
      }),
    });
    if (!r.ok) throw new Error(`Ollama ${r.status}`);
    const j: any = await r.json();
    const reply: string = j?.message?.content ?? '';
    return parseEdits(reply);
  };
}
