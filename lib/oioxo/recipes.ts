/**
 * oioxo Code (OIOXO_CODE.md §2, step 2 RETRIEVE) — task RECIPES that ground a
 * small model. A weak writer drafts far better when it's handed the correct
 * STRUCTURE for the kind of thing being built (a game loop, a list app, …) and
 * just fills it in — rather than inventing architecture it can't. These are
 * compact, correct skeletons/checklists injected into the plan + each build step.
 *
 * Deterministic (we author them), so they don't depend on the model's recall.
 * Pure + Node-testable; matched by keywords in the goal.
 */
/** A behavioral acceptance check, evaluated INSIDE the running preview. `src` is a
 *  JS boolean expression (truthy = pass). These turn "it runs" into "it's actually
 *  the thing asked for" — failures feed the repair loop until they pass. */
export interface Check {
  name: string;
  src: string;
}

export interface Recipe {
  /** Why it matched (for logs). */
  kind: string;
  /** Guidance + structure handed to the planner and the coder. */
  guidance: string;
  /** Behavioral checks the loop drives the build until they pass (verified live). */
  checks?: Check[];
  /** A concrete, DECOMPOSED plan for this task type — small steps a weak model
   *  can each do (we don't rely on the model to decompose; that's the loop thesis
   *  for any device). Used directly as the agent's plan when present. */
  steps?: string[];
}

// Authored step plans: each step is small + verifiable, so even a 0.5B coder can
// do one at a time and the loop verifies it — instead of one impossible "build X".
const STEPS: Record<string, string[]> = {
  'canvas-game': [
    'In the <script> inside index.html, set up the canvas 2D context and a fixed-timestep requestAnimationFrame loop (update() then render(); clear the canvas each frame).',
    'Define ALL game state in one object (the board/grid, entities, positions, score, status) and initialize it.',
    'In render(), draw the current state every frame — the board/background first, then each entity.',
    'Add keydown/keyup handlers that set an input state, and move the player in update() according to it (bounded by the rules/walls).',
    'Implement the actual mechanic the goal asks for — collisions, eating/scoring, and win/lose — and show the score on screen.',
  ],
  'list-app': [
    'Build the HTML: a labelled text input, an "add" button, and an empty <ul> list container.',
    'Keep items in a state array; render the list from it; wire the add button (and Enter key) to append and re-render.',
    'Add a remove control per item that updates state + re-renders; persist the array to localStorage and load it on start.',
  ],
  'form': [
    'Build the form HTML with labelled fields and a submit button.',
    'On submit, preventDefault and validate each field; show inline error messages.',
    'On valid submit, show a clear success state (and reset/keep values as appropriate).',
  ],
  'calculator': [
    'Build the HTML: a display element and a grid of digit + operator + equals/clear buttons.',
    'Keep the expression/operands in state; wire each button to update it and refresh the display.',
    'Implement safe evaluation (parse, do not eval raw input) for equals; handle clear and keyboard input.',
  ],
};

// Generic signals the probe records in the page (see STATIC_SERVER): how many
// animation frames ran, which event types were ever listened for, whether the
// canvas actually drew non-blank pixels. Enough to tell a real interactive build
// from a static placeholder, without knowing the project's internals.
const CHECKS: Record<string, Check[]> = {
  'canvas-game': [
    { name: 'a canvas is on the page', src: '!!document.querySelector("canvas")' },
    { name: 'an animation loop is running', src: '(window.__oioxoFrames||0) > 3' },
    { name: 'it responds to the keyboard', src: '(window.__oioxoListeners||[]).some(function(t){return /key/.test(t)})' },
    { name: 'the canvas draws real content (not blank)', src: 'window.__oioxoCanvasPainted === true' },
  ],
  'list-app': [
    { name: 'has a text input', src: '!!document.querySelector("input,textarea")' },
    { name: 'has an add/submit control', src: '!!document.querySelector("button,[type=submit]")' },
  ],
  'form': [
    { name: 'has form fields', src: 'document.querySelectorAll("input,select,textarea").length > 0' },
    { name: 'has a submit control', src: '!!document.querySelector("button,[type=submit]")' },
  ],
  'calculator': [
    { name: 'has buttons', src: 'document.querySelectorAll("button").length >= 5' },
    { name: 'has a display', src: '!!document.querySelector("input,output,[data-display],.display,#display")' },
  ],
};

const CANVAS_GAME = `This is a CANVAS GAME. Build it properly, not a placeholder:
- One <canvas> + a fixed-timestep game loop via requestAnimationFrame (update(dt) then render()).
- Keep mutable game state in one object (entities, positions, score, status).
- Handle keyboard input with keydown/keyup setting an input state; move on update().
- Draw every frame from state; clear the canvas first.
- Implement the ACTUAL mechanics the user asked for (e.g. for Pac-Man: a tile MAZE
  grid, pellets to eat, the player moving on the grid by arrow keys, ghost entities
  that move, collision + score). A single shape is NOT acceptable.
- No external libraries; vanilla JS, all inside index.html (one file).`;

const LIST_APP = `This is a LIST/CRUD app (todo-like):
- Render items from an array of state; an input + button to add; each item removable.
- Wire events with addEventListener; re-render from state on every change.
- Persist to localStorage so items survive reload. Keep it accessible (labels, buttons).`;

const FORM_APP = `This is a FORM app:
- Real fields with <label>s, validation on submit, and a clear success/error state.
- Prevent default submit; validate; show inline messages. Don't navigate away.`;

const DASHBOARD = `This is a DASHBOARD/data UI:
- Sample/generated data in state; render cards/table/list; a simple chart can be
  drawn on canvas. Make it look intentional (layout, spacing), not a stub.`;

const CALC = `This is a CALCULATOR:
- A display + buttons grid; keep the expression/operands in state; evaluate safely
  (no eval of raw input — parse). Support keyboard input too.`;

const TABLE: { test: RegExp; recipe: Recipe }[] = [
  { test: /\b(game|canvas|snake|pong|tetris|pac-?man|platformer|arcade|sprite|shooter|breakout)\b/i, recipe: { kind: 'canvas-game', guidance: CANVAS_GAME, checks: CHECKS['canvas-game'], steps: STEPS['canvas-game'] } },
  { test: /\b(todo|to-do|task list|checklist|notes app|shopping list|crud|list app)\b/i, recipe: { kind: 'list-app', guidance: LIST_APP, checks: CHECKS['list-app'], steps: STEPS['list-app'] } },
  { test: /\b(form|sign[- ]?up|login|contact|survey|quiz)\b/i, recipe: { kind: 'form', guidance: FORM_APP, checks: CHECKS['form'], steps: STEPS['form'] } },
  { test: /\b(dashboard|admin|analytics|chart|stats|report)\b/i, recipe: { kind: 'dashboard', guidance: DASHBOARD } },
  { test: /\b(calculator|calc)\b/i, recipe: { kind: 'calculator', guidance: CALC, checks: CHECKS['calculator'], steps: STEPS['calculator'] } },
];

/** The recipe whose keywords match the goal, or null. */
export function recipeFor(goal: string): Recipe | null {
  for (const { test, recipe } of TABLE) if (test.test(goal)) return recipe;
  return null;
}
