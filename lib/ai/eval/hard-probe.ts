/**
 * Xonvert AI — hard-prompt analysis (throwaway probe, not a gated test).
 *
 * Fresh, adversarial prompts NOT in the corpus, run through every deterministic
 * layer (intent gate, lexical router, multi-step planner, compose graph, research
 * facets, answer-type, image-subject, follow-up rewrite, symbol resolver, and the
 * new "image that says X" regex). Prints what each prompt would DO so we can read
 * the brain's behaviour on hard cases by eye.  Run: npx tsx lib/ai/eval/hard-probe.ts
 */

import { searchTools, confidence } from '../retrieval';
import { classifyIntent } from '../intent';
import { planRequest } from '../planner';
import { planGraph } from '../plan-graph';
import { facetQueries } from '../research';
import { detectAnswerType } from '../extract';
import { imageSubject } from '../image-search';
import { rewriteFollowup } from '../followup';
import { resolveSymbol } from '../quote';

const C = { g: (s: string) => `\x1b[32m${s}\x1b[0m`, r: (s: string) => `\x1b[31m${s}\x1b[0m`, y: (s: string) => `\x1b[33m${s}\x1b[0m`, d: (s: string) => `\x1b[2m${s}\x1b[0m`, b: (s: string) => `\x1b[1m${s}\x1b[0m` };

// The live image-text branch regex (kept in sync with AiApp.tsx 2.85).
const IMG_TEXT = /\b(?:make|create|generate|design|give me|need|want|build)\b[\s\S]*?\b(?:image|picture|poster|graphic|banner|card|wallpaper)\b[\s\S]*?\b(?:that says|saying|says|that reads?|reading|writes?|write|with (?:the )?(?:text|words?|caption)(?: of)?|with)\b\s*[:\-]?\s*["“']?(.+?)["”']?\s*$/i;
const imgTextPhrase = (t: string): string | null => {
  const m = t.match(IMG_TEXT); const p = m?.[1]?.trim();
  return p && p.length >= 1 && p.length <= 80 && !/\b(my|loan|calculation|bmi|investment)\b/i.test(p) ? p : null;
};

function route(q: string) {
  const lex = searchTools(q, { limit: 3 });
  return { conf: confidence(lex), top: lex[0]?.doc.id ?? '(none)', rel: (lex[0]?.rel ?? 0).toFixed(2) };
}

/** Diverse, hard prompts grouped by the behaviour we EXPECT, with a note. */
const SUITES: { name: string; cases: { q: string; expect: string }[] }[] = [
  {
    name: 'Paraphrased tool requests (no exact keyword)',
    cases: [
      { q: 'shrink this photo so it fits in an email', expect: 'image-compress / resize' },
      { q: 'my video is sideways, turn it the right way up', expect: 'video-rotate' },
      { q: 'take the background noise out of this recording', expect: 'audio noise / clean' },
      { q: 'chop the first 10 seconds off my clip', expect: 'video-trim' },
      { q: 'I need this Word doc as a PDF', expect: 'doc→pdf' },
      { q: 'glue these three PDFs into one', expect: 'pdf-merge' },
      { q: 'make the text in this image readable as actual text', expect: 'OCR / image-to-text' },
      { q: 'strip the audio out of this mp4', expect: 'video→audio / extract' },
    ],
  },
  {
    name: 'Multi-step chains (planner)',
    cases: [
      { q: 'convert this word doc to pdf then add page numbers', expect: '2-step doc→pdf→numbers' },
      { q: 'compress this video and then add my logo as a watermark', expect: '2-step' },
      { q: 'take pages 3-5 of this pdf, remove the images, and translate to arabic', expect: '3-step split→strip→translate' },
      { q: 'resize all these images to 800px and convert them to webp', expect: '2-step resize→convert' },
    ],
  },
  {
    name: 'Compose graph (producer → renderer)',
    cases: [
      { q: 'make a poster with my bmi on it', expect: 'compose bmi→poster' },
      { q: 'put my loan monthly payment on an image', expect: 'compose loan→poster' },
      { q: 'generate a qr code for my wifi password', expect: 'qr (single or compose)' },
      { q: 'create an image that shows the result of 15% of 240', expect: 'compose calc→poster OR none' },
    ],
  },
  {
    name: 'Image-that-says-X (model-free poster branch)',
    cases: [
      { q: 'make an image for me inside it write: i\'m good', expect: 'phrase="i\'m good"' },
      { q: 'create a banner that says SALE 50% OFF', expect: 'phrase="SALE 50% OFF"' },
      { q: 'design a poster reading Happy Birthday Mom', expect: 'phrase' },
      { q: 'I want a wallpaper with the words stay hungry stay foolish', expect: 'phrase' },
      { q: 'make an image with my loan calculation on it', expect: 'NULL (→ compose)' },
      { q: 'make a picture of a sunset over mountains', expect: 'NULL (→ media-subject, no text)' },
    ],
  },
  {
    name: 'Should NOT route — questions / opinion / live data',
    cases: [
      { q: 'who won the world cup in 2022', expect: 'question' },
      { q: 'whats the best programming language to learn first', expect: 'question (opinion)' },
      { q: 'how much is one bitcoin right now', expect: 'question (live)' },
      { q: 'is it going to rain tomorrow in London', expect: 'question (live)' },
      { q: 'explain how a transformer neural network works', expect: 'question (explain)' },
      { q: 'order me a large pepperoni pizza', expect: 'question/chitchat — NOT a tool' },
    ],
  },
  {
    name: 'Chitchat & follow-up (with prior topic)',
    cases: [
      { q: 'hey there', expect: 'chitchat' },
      { q: 'who made you', expect: 'chitchat' },
      { q: 'tell me more', expect: 'followup' },
      { q: 'why though?', expect: 'followup' },
      { q: 'and then what', expect: 'followup' },
    ],
  },
  {
    name: 'Media-subject (find real image, not generate)',
    cases: [
      { q: 'show me a picture of Michael Jordan', expect: 'subject="Michael Jordan"' },
      { q: 'find me an image of the Eiffel Tower at night', expect: 'subject' },
      { q: 'I want a photo of a golden retriever puppy', expect: 'subject' },
    ],
  },
  {
    name: 'Answer-type detection (rich extract)',
    cases: [
      { q: 'how to make carbonara from scratch', expect: 'recipe' },
      { q: 'how do I change a flat tire', expect: 'howto' },
      { q: 'python function to reverse a linked list', expect: 'code' },
      { q: 'what is photosynthesis', expect: 'definition' },
      { q: 'why did the roman empire fall', expect: 'general (facets)' },
    ],
  },
  {
    name: 'Live symbol resolution (quote)',
    cases: [
      { q: 'bitcoin price', expect: 'BTC crypto' },
      { q: 'how much is apple stock', expect: 'AAPL stock' },
      { q: 'usd to eur', expect: 'forex' },
      { q: 'tesla share price today', expect: 'TSLA stock' },
    ],
  },
];

console.log(C.b('\nXonvert AI — hard-prompt analysis\n'));

for (const suite of SUITES) {
  console.log(C.b(suite.name));
  for (const { q, expect } of suite.cases) {
    const fam = classifyIntent(q, { hasTopic: suite.name.includes('follow-up') });
    const lines: string[] = [];

    if (suite.name.startsWith('Multi-step')) {
      const steps = planRequest(q, { inputMedium: /\b(word|docx?)\b/i.test(q) ? 'doc' : undefined }).steps.map((s) => s.toolId);
      lines.push(`plan: ${steps.join(' → ') || C.r('(empty)')}`);
    } else if (suite.name.startsWith('Compose')) {
      const g = planGraph(q);
      lines.push(`graph: ${g.kind} ${g.nodes.map((n) => n.toolId).join('→') || '-'} missing:${g.missing?.length ?? 0}`);
    } else if (suite.name.startsWith('Image-that-says')) {
      const p = imgTextPhrase(q);
      lines.push(`phrase: ${p === null ? C.y('NULL') : JSON.stringify(p)}`);
    } else if (suite.name.startsWith('Media-subject')) {
      lines.push(`fam:${fam}  subject:${JSON.stringify(imageSubject(q))}`);
    } else if (suite.name.startsWith('Answer-type')) {
      lines.push(`type:${detectAnswerType(q)}  facets:[${facetQueries(q).join(' | ')}]`);
    } else if (suite.name.startsWith('Live symbol')) {
      const s = resolveSymbol(q);
      lines.push(`symbol: ${s ? `${s.symbol} (${s.kind})` : C.y('null')}`);
    } else if (suite.name.startsWith('Chitchat')) {
      const fu = rewriteFollowup(q, 'world war 1');
      lines.push(`fam:${fam}${fu ? `  followup→"${fu}"` : ''}`);
    } else {
      const rr = route(q);
      lines.push(`fam:${fam}  route:${rr.conf} ${rr.top} (rel ${rr.rel})`);
    }
    console.log(`  ${C.d('•')} ${q}`);
    console.log(`      ${C.d('expect:')} ${expect}`);
    console.log(`      ${lines.join('   ')}`);
  }
  console.log('');
}
