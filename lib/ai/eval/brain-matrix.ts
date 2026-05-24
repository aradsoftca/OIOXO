/**
 * Xonvert AI — brain BEHAVIOR matrix (Node).
 *
 * Not a pass/fail unit test — an OBSERVATION report. Pushes many diverse, real-
 * world requests through the full deterministic spine (inferGoal → decideBrain,
 * + planJob detail) and prints what the brain decides for each, grouped by
 * category, so we can SEE the breadth of behaviour at a glance.
 *
 * Run:  npx tsx lib/ai/eval/brain-matrix.ts
 */

import { inferGoal, type GoalCtx } from '../goal';
import { decideBrain, type BrainDecision } from '../brain';
import { planJob, type JobStep } from '../job';

const C = { dim: (s: string) => `\x1b[2m${s}\x1b[0m`, b: (s: string) => `\x1b[1m${s}\x1b[0m`, cy: (s: string) => `\x1b[36m${s}\x1b[0m`, gn: (s: string) => `\x1b[32m${s}\x1b[0m`, yl: (s: string) => `\x1b[33m${s}\x1b[0m` };

function decisionStr(d: BrainDecision): string {
  switch (d.kind) {
    case 'chat': return C.dim('chat');
    case 'search': return C.cy('search') + C.dim(`("${d.query}"${d.lang !== 'en' ? ` ·${d.lang}` : ''})`);
    case 'assist': return C.yl('assist') + C.dim(`(${d.family ?? '?'})`);
    case 'tool': return C.gn('tool') + C.dim(`:${d.toolId}${d.targetFormat ? `→${d.targetFormat}` : ''}`);
    case 'chain': return C.gn('chain') + C.dim(`[${d.toolIds.join('·')}]`);
    case 'job': {
      const steps = d.plan.steps.map((s: JobStep) => s.type === 'write' ? `write:${(s as any).form}/${(s as any).length}` : s.type === 'package' ? `pkg:${(s as any).format}` : s.type).join('→');
      return C.b('JOB') + C.dim(` [${steps}]`);
    }
  }
}

function row(message: string, ctx: GoalCtx = {}) {
  const goal = inferGoal(message, ctx);
  const d = decideBrain(goal, { message, hasFile: ctx.hasFile, fileFamily: ctx.fileFamily });
  const fileTag = ctx.hasFile ? C.dim(`[${ctx.fileFamily} file] `) : '';
  console.log(`  ${fileTag}${message.slice(0, 50).padEnd(52)} ${decisionStr(d)}`);
}

function section(title: string, rows: () => void) { console.log('\n' + C.b(title)); rows(); }

console.log(C.b('\n═══ BRAIN BEHAVIOUR MATRIX (deterministic spine) ═══'));

section('Composition jobs (research + long-form + media)', () => {
  row('write a detailed article about how soccer affects society, with images, as a pdf, and read it aloud');
  row('write an essay on the causes of world war 1');
  row('draft a blog post about coffee culture with pictures');
  row('write a comprehensive report on renewable energy as a word document');
  row('create an in-depth guide to sourdough baking as a pdf');
  row('write me a poem about the ocean');
  row('write a short story for kids about a dragon, with illustrations, as a pdf');
  row('write a cover letter for a software engineering job');
  row('write a professional email asking for a deadline extension');
  row('compose a speech for a retirement party');
});

section('Factual / informational questions → search & answer', () => {
  row('what is bademjoon');
  row('who invented the telephone');
  row('why is the sky blue');
  row('what is the population of japan');
  row('bitcoin price');
  row('best programming language to learn in 2026');
  row('what is my problem with ants');
  row('how does photosynthesis work');
});

section('Language-native (answer in the user language)', () => {
  row('in italiano dimmi cosa e bademjoon');
  row('explain quantum computing in spanish');
  row('what is gravity, answer in french');
});

section('Single-tool transforms (file present)', () => {
  row('compress this', { hasFile: true, fileFamily: 'image' });
  row('remove the background', { hasFile: true, fileFamily: 'image' });
  row('make it black and white', { hasFile: true, fileFamily: 'image' });
  row('rotate it 90 degrees', { hasFile: true, fileFamily: 'image' });
  row('transcribe this', { hasFile: true, fileFamily: 'audio' });
  row('summarize this', { hasFile: true, fileFamily: 'pdf' });
  row('convert this to mp3', { hasFile: true, fileFamily: 'audio' });
});

section('Cross-family / format goals', () => {
  row('turn my mp3 into a bmp');
  row('convert this song to a png', { hasFile: true, fileFamily: 'audio' });
  row('convert this to pdf', { hasFile: true, fileFamily: 'doc' });
  row('make this image a pdf', { hasFile: true, fileFamily: 'image' });
});

section('Blocked / how-do-I → assist (offer to help)', () => {
  row('why cant i edit my pdf');
  row('how do i crop a photo');
  row("i can't compress my video");
  row('help me convert a file');
});

section('Chat / persona', () => {
  row('hello there');
  row('thank you so much');
  row('who are you');
  row('tell me a joke');
});

section('Tricky / ambiguous (should not misfire)', () => {
  row('make a poster of taylor swift');          // create graphic, not prose/search
  row('generate a qr code for my website');      // tool, not job
  row('uppercase this: hello world');            // text op, not search
  row('what can you do');                         // help overview
  row('write my name on the photo', { hasFile: true, fileFamily: 'image' }); // edit, not write-job
  row('order me a pizza');                        // not our domain → search/answer
});

console.log(C.dim('\n(Observation report — review the decisions above for any that look wrong.)\n'));
