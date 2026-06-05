/**
 * qa — extractive question-answering (the answer SPAN).
 *
 * Sentence-ranking finds the topical sentence but not the precise value — the
 * battery showed "how tall is Everest" / "capital of Australia" returned a
 * topical sentence without "8,849 m" / "Canberra". A SQuAD extractive-QA head
 * POINTS at the exact answer span in the gathered text (it can't hallucinate —
 * it only selects a substring). This is the on-device, untrained floor of the
 * QA head we train on arad; lazy-loaded (~65MB), cached after first use.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
let _qa: Promise<any> | null = null;

async function getQa(): Promise<any> {
  _qa ??= (async () => {
    const lib: any = await import('@xenova/transformers');
    try { lib.env.allowLocalModels = false; lib.env.allowRemoteModels = true; } catch { /* version shape */ }
    return lib.pipeline('question-answering', 'Xenova/distilbert-base-cased-distilled-squad');
  })().catch((e) => { _qa = null; throw e; });
  return _qa;
}

export interface Span { answer: string; score: number }

/** Extract the answer span for `question` from `context`. Null on failure / no
 *  model (so the reader falls back to sentence selection). */
export async function extractAnswerSpan(question: string, context: string): Promise<Span | null> {
  if (!context || context.length < 20) return null;
  try {
    const qa = await getQa();
    const r: any = await qa(question, context.slice(0, 3000));
    const answer = String(r?.answer ?? '').trim();
    return answer ? { answer, score: Number(r?.score ?? 0) } : null;
  } catch {
    return null;
  }
}
