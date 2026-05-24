/**
 * MASSIVE tool-usage trainer — for EVERY tool in the registry, synthesize a
 * natural request from its name and check whether the chat engine routes to
 * THAT tool. Surfaces tool-routing error classes across all 300+ tools:
 *   - not-tool : a clear tool request fell through to answer/other (unreachable)
 *   - wrong-cat: routed to a tool in a different category (bad)
 *   - same-cat : routed to a sibling tool (usually acceptable)
 *   - correct  : exact tool
 *
 *   npx tsx lib/ai/eval/oioxo-tools-eval.ts
 */
import { decideRoute } from '../oioxo-engine';
import { TOOLS, getTool } from '../../registry';
import type { Category } from '../../registry/types';

type FileCat = 'image' | 'audio' | 'video' | 'pdf' | 'text' | null;
const CAT_FILE: Partial<Record<Category, FileCat>> = {
  image: 'image', audio: 'audio', video: 'video', pdf: 'pdf', text: 'text', subtitle: 'text',
};

// A natural request for a tool = its name, lowercased (names are action phrases:
// "Compress Image", "Remove Background", "Resize Image"…). The file context is
// inferred from the tool's category so file-bound tools route realistically.
function promptFor(name: string): string {
  return name.toLowerCase();
}

const buckets = { correct: 0, sameCat: 0, wrongCat: 0, notTool: 0 };
const misses: { kind: string; id: string; prompt: string; got: string }[] = [];

for (const tool of TOOLS) {
  const fileCat = CAT_FILE[tool.category] ?? null;
  const route = decideRoute(promptFor(tool.name), fileCat);
  if (route.kind !== 'tool' || !route.toolId) {
    buckets.notTool++;
    misses.push({ kind: 'not-tool', id: tool.id, prompt: promptFor(tool.name), got: route.kind });
  } else if (route.toolId === tool.id) {
    buckets.correct++;
  } else {
    const got = getTool(route.toolId);
    if (got && got.category === tool.category) {
      buckets.sameCat++;
    } else {
      buckets.wrongCat++;
      misses.push({ kind: 'wrong-cat', id: tool.id, prompt: promptFor(tool.name), got: `${route.toolId}` });
    }
  }
}

const total = TOOLS.length;
const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
console.log(`\n=== oioxo TOOL-usage eval over ${total} tools ===`);
console.log(`  correct (exact)      ${buckets.correct}  ${pct(buckets.correct)}`);
console.log(`  same-category (ok)   ${buckets.sameCat}  ${pct(buckets.sameCat)}`);
console.log(`  WRONG category       ${buckets.wrongCat}  ${pct(buckets.wrongCat)}`);
console.log(`  NOT a tool (missed)  ${buckets.notTool}  ${pct(buckets.notTool)}`);
console.log(`  reachable (exact+sameCat) = ${pct(buckets.correct + buckets.sameCat)}`);

const notTool = misses.filter((m) => m.kind === 'not-tool');
console.log(`\n--- ${notTool.length} tools NOT reachable as a tool (sample) ---`);
for (const m of notTool.slice(0, 25)) console.log(`  [${m.got}]  "${m.prompt}"  (${m.id})`);

const wrong = misses.filter((m) => m.kind === 'wrong-cat');
console.log(`\n--- ${wrong.length} routed to WRONG category (sample) ---`);
for (const m of wrong.slice(0, 20)) console.log(`  "${m.prompt}"  -> ${m.got}  (wanted ${m.id})`);
