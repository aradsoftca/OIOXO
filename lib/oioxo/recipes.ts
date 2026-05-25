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
export interface Recipe {
  /** Why it matched (for logs). */
  kind: string;
  /** Guidance + structure handed to the planner and the coder. */
  guidance: string;
}

const CANVAS_GAME = `This is a CANVAS GAME. Build it properly, not a placeholder:
- One <canvas> + a fixed-timestep game loop via requestAnimationFrame (update(dt) then render()).
- Keep mutable game state in one object (entities, positions, score, status).
- Handle keyboard input with keydown/keyup setting an input state; move on update().
- Draw every frame from state; clear the canvas first.
- Implement the ACTUAL mechanics the user asked for (e.g. for Pac-Man: a tile MAZE
  grid, pellets to eat, the player moving on the grid by arrow keys, ghost entities
  that move, collision + score). A single shape is NOT acceptable.
- No external libraries; vanilla JS in the existing files.`;

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
  { test: /\b(game|canvas|snake|pong|tetris|pac-?man|platformer|arcade|sprite|shooter|breakout)\b/i, recipe: { kind: 'canvas-game', guidance: CANVAS_GAME } },
  { test: /\b(todo|to-do|task list|checklist|notes app|shopping list|crud|list app)\b/i, recipe: { kind: 'list-app', guidance: LIST_APP } },
  { test: /\b(form|sign[- ]?up|login|contact|survey|quiz)\b/i, recipe: { kind: 'form', guidance: FORM_APP } },
  { test: /\b(dashboard|admin|analytics|chart|stats|report)\b/i, recipe: { kind: 'dashboard', guidance: DASHBOARD } },
  { test: /\b(calculator|calc)\b/i, recipe: { kind: 'calculator', guidance: CALC } },
];

/** The recipe whose keywords match the goal, or null. */
export function recipeFor(goal: string): Recipe | null {
  for (const { test, recipe } of TABLE) if (test.test(goal)) return recipe;
  return null;
}
