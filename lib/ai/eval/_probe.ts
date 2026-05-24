import { candidatesFor, guardrailTool, retrievalConfidence } from '../decide';
import { inferGoal } from '../goal';
import { wordFamily, planCapability, type Family } from '../capability-graph';

const cases: [string, any][] = [
  ['extract the audio from this video and transcribe it', 'video'],
  ['transcribe this and translate it to french', 'audio'],
  ['turn my mp3 into a stl', null],
  ['convert this song to cad', null],
  ['summarize a youtube video', null],
  ['email this to my mom', null],
  ['compress this then add a watermark', 'image'],
  ['remove the background then convert to jpg', 'image'],
];
for (const [q, file] of cases) {
  const goal = inferGoal(q, { hasFile: file != null, fileFamily: file });
  const inputFam = file ?? goal.from;
  const toFam = goal.to ? wordFamily(goal.to) : null;
  let path = null;
  if (goal.to && inputFam && toFam && toFam !== inputFam) path = planCapability(inputFam as Family, goal.to);
  console.log(JSON.stringify({ q, file, from: goal.from, to: goal.to, subject: goal.subject, inputFam, toFam, pathEdges: path ? path.edges.map((e:any)=>e.toolId) : null }));
}
