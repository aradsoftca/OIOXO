/**
 * oioxo Code — CAPABILITY GRAPH FOR APP COMPOSITION (Gem 6). Your answer-brain has
 * a capability graph (tool produces X, tool accepts X) so it can CHAIN tools to
 * reach a goal. This is the same idea for CODE: each brick declares what it
 * `provides` and `requires`; given a goal we infer the capabilities it needs, then
 * path-find a set of VERIFIED bricks that cover those needs + their dependencies,
 * topologically ordered (a brick's requirements come first). Whatever no brick
 * provides is reported as GLUE — the only part the small model must author.
 *
 * App-building becomes mostly deterministic composition of proven units, which is
 * exactly where a weak model is reliable; the model's hard job shrinks to wiring.
 * Pure + Node-testable.
 */
import { type Brick, makeBrick } from './bricks';

/** Capability needs implied by a goal (keyword → capability tags). Coarse on
 *  purpose; the composer + oracle do the real work, this just seeds the search. */
const NEED_RULES: { test: RegExp; needs: string[] }[] = [
  { test: /\b(todo|to-do|task list|checklist|list app|notes app|shopping list)\b/i, needs: ['list-state', 'list-ui', 'persistence'] },
  { test: /\b(form|sign ?up|sign ?in|log ?in|contact|survey|register)\b/i, needs: ['form-ui', 'validation'] },
  { test: /\b(game|canvas|snake|pong|arcade|sprite)\b/i, needs: ['canvas', 'game-loop', 'input-keys'] },
  { test: /\b(chat|messenger|messaging)\b/i, needs: ['message-state', 'message-ui', 'transport'] },
  { test: /\b(counter|clicker|tally)\b/i, needs: ['counter-state', 'counter-ui'] },
  { test: /\b(fetch|api|from an? api|http|rest)\b/i, needs: ['fetch'] },
  { test: /\b(save|persist|remember|local ?storage|offline)\b/i, needs: ['persistence'] },
  { test: /\b(dark ?mode|theme|toggle)\b/i, needs: ['theme-toggle'] },
];

/** Infer the capability needs of a goal (deduped, in first-seen order). */
export function neededCapabilities(goal: string): string[] {
  const out: string[] = [];
  for (const r of NEED_RULES) if (r.test.test(goal)) for (const n of r.needs) if (!out.includes(n)) out.push(n);
  return out;
}

export interface AppPlan {
  /** Verified bricks to assemble, dependency-ordered (requires before provides). */
  bricks: Brick[];
  /** Capabilities covered by the chosen bricks. */
  satisfied: string[];
  /** Needs no brick provides → the model writes these (the glue). */
  glue: string[];
  /** A brick was chosen but one of its requires is unmet (model must bridge it). */
  unmetRequires: string[];
}

/**
 * Plan an app: cover the needed capabilities with the fewest verified bricks, pull
 * in their transitive `requires`, and topologically order the result. Capabilities
 * nothing provides become `glue`. Greedy + dependency-closed; deterministic.
 */
export function planApp(needs: string[], bricks: Brick[]): AppPlan {
  const verified = bricks.filter((b) => b.verified && (b.provides?.length || b.requires?.length));
  const provider = new Map<string, Brick>();
  for (const b of verified) for (const cap of b.provides ?? []) if (!provider.has(cap)) provider.set(cap, b);

  const chosen = new Map<string, Brick>(); // id → brick
  const satisfied = new Set<string>();
  const glue: string[] = [];
  const want = [...needs];

  // Pull in a provider for each need, then recursively its requirements.
  while (want.length) {
    const cap = want.shift()!;
    if (satisfied.has(cap)) continue;
    const b = provider.get(cap);
    if (!b) { if (!glue.includes(cap)) glue.push(cap); continue; }
    if (!chosen.has(b.id)) {
      chosen.set(b.id, b);
      for (const p of b.provides ?? []) satisfied.add(p);
      for (const req of b.requires ?? []) if (!satisfied.has(req)) want.push(req);
    } else {
      satisfied.add(cap);
    }
  }

  // Topological order: a brick comes after the bricks that provide its requires.
  const ordered = topoSort([...chosen.values()]);
  const unmetRequires: string[] = [];
  const providedAll = new Set<string>();
  for (const b of ordered) for (const p of b.provides ?? []) providedAll.add(p);
  for (const b of ordered) for (const req of b.requires ?? []) {
    if (!providedAll.has(req) && !unmetRequires.includes(req)) unmetRequires.push(req);
  }
  return { bricks: ordered, satisfied: [...satisfied], glue, unmetRequires };
}

/** Order bricks so each brick's `requires` are provided by an earlier brick.
 *  Stable + cycle-safe (a cycle just falls back to insertion order). */
function topoSort(bricks: Brick[]): Brick[] {
  const byCap = new Map<string, Brick>();
  for (const b of bricks) for (const p of b.provides ?? []) byCap.set(p, b);
  const out: Brick[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (b: Brick) => {
    if (done.has(b.id) || visiting.has(b.id)) return;
    visiting.add(b.id);
    for (const req of b.requires ?? []) {
      const dep = byCap.get(req);
      if (dep && dep.id !== b.id) visit(dep);
    }
    visiting.delete(b.id);
    if (!done.has(b.id)) { done.add(b.id); out.push(b); }
  };
  for (const b of bricks) visit(b);
  return out;
}

/** Render the plan for the planner/coder prompt: the verified blocks to assemble
 *  (in order) + an explicit list of glue the model must write itself. */
export function renderAppPlan(plan: AppPlan): string {
  const blocks = plan.bricks.map((b, i) =>
    `${i + 1}. ${b.title}  (provides: ${(b.provides ?? []).join(', ') || '—'})\n\`\`\`${b.lang}\n${b.code.trim()}\n\`\`\``);
  const glue = plan.glue.length ? `\nWrite the glue for: ${plan.glue.join(', ')}.` : '';
  return `Assemble these verified building blocks in order, then wire them together:\n${blocks.join('\n\n')}${glue}`;
}

/* ── A small capability-tagged catalog so planApp has proven blocks to compose.
 * These are app-level units (state/ui/persistence/glue); they're JS/HTML so the
 * runtime/preview oracle validates them when used, not the Node type oracle. */
const cap = (b: Omit<Brick, 'id' | 'ts' | 'origin' | 'verified'>): Brick => makeBrick({ ...b, origin: 'seed', verified: true });

export const APP_BRICKS: Brick[] = [
  cap({
    title: 'list state — an array model with add/remove', kind: 'app', lang: 'js',
    tags: ['list', 'state', 'todo', 'array'], provides: ['list-state'], requires: [],
    code: `const state = { items: [] };\nfunction addItem(text){ state.items.push({ text, done:false }); render(); }\nfunction removeItem(i){ state.items.splice(i,1); render(); }\n`,
  }),
  cap({
    title: 'list UI — input + add button + rendered <ul>', kind: 'app', lang: 'js',
    tags: ['list', 'ui', 'todo', 'render'], provides: ['list-ui'], requires: ['list-state'],
    code: `function render(){ const ul=document.querySelector('#list'); ul.innerHTML=''; state.items.forEach((it,i)=>{ const li=document.createElement('li'); li.textContent=it.text; ul.appendChild(li); }); }\ndocument.querySelector('#add').addEventListener('click',()=>{ const inp=document.querySelector('#text'); if(inp.value){ addItem(inp.value); inp.value=''; } });\n`,
  }),
  cap({
    title: 'localStorage persistence — save/load state', kind: 'app', lang: 'js',
    tags: ['persist', 'localstorage', 'save', 'offline'], provides: ['persistence'], requires: ['list-state'],
    code: `function save(){ localStorage.setItem('app', JSON.stringify(state.items)); }\nfunction load(){ try{ state.items = JSON.parse(localStorage.getItem('app')||'[]'); }catch{ state.items=[]; } }\nload();\n`,
  }),
  cap({
    title: 'counter state + UI', kind: 'app', lang: 'js',
    tags: ['counter', 'click', 'increment'], provides: ['counter-state', 'counter-ui'], requires: [],
    code: `let n=0; const out=document.querySelector('#count');\ndocument.querySelector('#inc').addEventListener('click',()=>{ n++; out.textContent=String(n); });\n`,
  }),
  cap({
    title: 'theme toggle — light/dark', kind: 'app', lang: 'js',
    tags: ['theme', 'dark', 'toggle'], provides: ['theme-toggle'], requires: [],
    code: `document.querySelector('#theme').addEventListener('click',()=>{ document.body.classList.toggle('dark'); });\n`,
  }),
];
