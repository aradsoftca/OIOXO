/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo — Bring Your Own (frontier) Key. The agent is model-pluggable: the small
 * on-device coder is the default, a local Ollama is one option, and THIS lets a
 * user plug in their own frontier API key (OpenAI / Anthropic / OpenRouter / Groq
 * / Google) for frontier-grade results inside the SAME verified loop. The key is
 * stored only in the browser and calls go straight to the provider — host-nothing,
 * we never see the key or proxy the traffic.
 *
 * Reuses the small coder's grounded prompt + edit parsing (codegen.ts), so only
 * the writer changes; the device still proves the result. Request shaping is pure
 * + testable with an injected fetch.
 */
import type { Edit, GenContext, GenerateFn } from './codeloop';
import { buildPrompt, parseEdits } from './codegen';
import { retrieveContext } from './retrieve';

export type Provider = 'openai' | 'anthropic' | 'openrouter' | 'groq' | 'google' | 'custom';
type Style = 'openai' | 'anthropic' | 'google';

export interface ProviderSpec {
  label: string;
  style: Style;
  baseURL: string;
  defaultModel: string;
  /** Where to get a key (shown in the UI). */
  keysUrl: string;
  /** All requests are browser→provider; these all send permissive CORS. */
}

export const PROVIDERS: Record<Exclude<Provider, 'custom'>, ProviderSpec> = {
  openrouter: { label: 'OpenRouter (any model)', style: 'openai', baseURL: 'https://openrouter.ai/api/v1', defaultModel: 'anthropic/claude-3.5-sonnet', keysUrl: 'https://openrouter.ai/keys' },
  openai: { label: 'OpenAI', style: 'openai', baseURL: 'https://api.openai.com/v1', defaultModel: 'gpt-4o', keysUrl: 'https://platform.openai.com/api-keys' },
  anthropic: { label: 'Anthropic (Claude)', style: 'anthropic', baseURL: 'https://api.anthropic.com/v1', defaultModel: 'claude-3-5-sonnet-latest', keysUrl: 'https://console.anthropic.com/settings/keys' },
  groq: { label: 'Groq (fast)', style: 'openai', baseURL: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile', keysUrl: 'https://console.groq.com/keys' },
  google: { label: 'Google (Gemini)', style: 'google', baseURL: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-2.0-flash', keysUrl: 'https://aistudio.google.com/apikey' },
};

export interface FrontierConfig {
  provider: Provider;
  model: string;
  key: string;
  /** For 'custom' (any OpenAI-compatible endpoint). */
  baseURL?: string;
}

const STORE_KEY = 'oioxo.byok';

export function getFrontier(): FrontierConfig | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORE_KEY) : null;
    if (!raw) return null;
    const c = JSON.parse(raw) as FrontierConfig;
    return c.key && c.model ? c : null;
  } catch { return null; }
}
export function setFrontier(c: FrontierConfig | null): void {
  try { if (c) localStorage.setItem(STORE_KEY, JSON.stringify(c)); else localStorage.removeItem(STORE_KEY); } catch { /* */ }
}

function specFor(c: FrontierConfig): { style: Style; baseURL: string } {
  if (c.provider === 'custom') return { style: 'openai', baseURL: c.baseURL || 'https://api.openai.com/v1' };
  const s = PROVIDERS[c.provider];
  return { style: s.style, baseURL: c.baseURL || s.baseURL };
}

type Fetcher = typeof fetch;

/** One chat turn against the configured frontier provider. Normalizes the three
 *  API shapes (OpenAI-compatible / Anthropic / Gemini) to a single string reply. */
export async function frontierChat(
  c: FrontierConfig,
  system: string,
  user: string,
  opts: { maxTokens?: number; temperature?: number; fetch?: Fetcher } = {},
): Promise<string> {
  const fetcher = opts.fetch ?? fetch;
  const { style, baseURL } = specFor(c);
  const maxTokens = opts.maxTokens ?? 2048;
  const temperature = opts.temperature ?? 0.2;

  if (style === 'anthropic') {
    const r = await fetcher(`${baseURL}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': c.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: c.model, max_tokens: maxTokens, temperature, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const j: any = await r.json();
    return (j?.content ?? []).map((b: any) => b?.text ?? '').join('');
  }

  if (style === 'google') {
    const r = await fetcher(`${baseURL}/models/${encodeURIComponent(c.model)}:generateContent?key=${encodeURIComponent(c.key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
    });
    if (!r.ok) throw new Error(`Google ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const j: any = await r.json();
    return (j?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? '').join('');
  }

  // OpenAI-compatible (openai / openrouter / groq / custom)
  const r = await fetcher(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${c.key}`,
      // OpenRouter etiquette (ignored by others)
      'HTTP-Referer': 'https://oioxo.com',
      'X-Title': 'oioxo',
    },
    body: JSON.stringify({ model: c.model, max_tokens: maxTokens, temperature, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error(`${c.provider} ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j: any = await r.json();
  return j?.choices?.[0]?.message?.content ?? '';
}

const SYSTEM =
  'You are an expert coding agent. Make the SMALLEST change that satisfies the task ' +
  'or fixes the error. Output ONLY the files you create or change — each as a fenced ' +
  'code block whose info line is the file PATH, e.g.\n```src/add.js\n<contents>\n```\nNo prose.';

/** A GenerateFn driven by the user's frontier model — same grounded prompt + edit
 *  parsing as the small coder, so the verified loop is identical. */
export function makeFrontierGenerate(c: FrontierConfig, opts: { getExtApis?: () => string; fetch?: Fetcher } = {}): GenerateFn {
  return async (ctx: GenContext): Promise<Edit[]> => {
    const retrieved = await retrieveContext(ctx.task, ctx.files).catch(() => undefined);
    const reply = await frontierChat(c, SYSTEM, buildPrompt(ctx, retrieved, opts.getExtApis?.()), {
      temperature: ctx.attempt === 0 ? 0.3 : 0.2,
      fetch: opts.fetch,
    });
    return parseEdits(reply, ctx.files);
  };
}
