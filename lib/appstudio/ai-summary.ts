import { BRAND, IS_OIOXO } from '@/lib/brand';

interface ConvLine { name: string; text: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let enginePromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getEngine(): Promise<any> {
  if (!enginePromise) {
    enginePromise = (async () => {
      // xonvert: heavy LLM features are out of scope (Qwen 0.5B ≈ 300 MB).
      if (!IS_OIOXO) throw new Error('Summaries are not available here');
      if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
        throw new Error('WebGPU required');
      }
      const webllm = await import('@mlc-ai/web-llm');
      return webllm.CreateMLCEngine('Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
    })();
  }
  return enginePromise;
}

export async function summarizeConversation(lines: ConvLine[]): Promise<string> {
  if (lines.length === 0) return 'No messages to summarize yet.';
  const engine = await getEngine();
  const transcript = lines.map((l) => `${l.name}: ${l.text}`).join('\n');
  const res = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: `You are ${BRAND}'s on-device assistant. Summarize the following conversation in 3-6 concise bullets. Capture decisions, action items (with owner if mentioned), and any open questions. Be brief.` },
      { role: 'user', content: transcript.slice(0, 8000) },
    ],
    temperature: 0.3,
    max_tokens: 320,
  });
  return (res.choices?.[0]?.message?.content ?? '').trim() || 'No summary available.';
}

export async function quickAnswer(prompt: string): Promise<string> {
  const engine = await getEngine();
  const res = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: `You are ${BRAND}'s on-device assistant. Be concise and friendly. Never mention any underlying model.` },
      { role: 'user', content: prompt },
    ],
    temperature: 0.6,
    max_tokens: 240,
  });
  return (res.choices?.[0]?.message?.content ?? '').trim() || '…';
}

export async function translateText(text: string, targetLang: string): Promise<string> {
  const engine = await getEngine();
  const res = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: `Translate the user's input to ${targetLang}. Output only the translation, no preface, no quotes.` },
      { role: 'user', content: text },
    ],
    temperature: 0.2,
    max_tokens: 280,
  });
  return (res.choices?.[0]?.message?.content ?? '').trim();
}
