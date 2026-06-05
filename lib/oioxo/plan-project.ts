/**
 * oioxo Code — LONG-HORIZON PROJECT PLANNER (roadmap #2). A hard project is not
 * "build it" — it's a dependency-ordered sequence of small, each-verifiable steps.
 * A weak model can't decompose a whole app reliably, so we DON'T ask it to: we
 * derive the plan deterministically from the capability graph (Gem 6) + task
 * recipes, then the loop builds each step and the oracle proves it. The model's
 * only job per step is local + grounded in a verified brick.
 *
 * Produces more than the old 2–6 step cap when a project needs it (scaffold →
 * one step per capability in dependency order → glue → wire-and-verify), so the
 * agent can carry a real 0→100 build instead of stalling after a few steps.
 * Pure + Node-testable.
 */
import type { PlanStep } from './agent';
import { neededCapabilities, planApp, APP_BRICKS } from './compose-app';
import { recipeFor } from './recipes';
import { SEED_BRICKS, type Brick } from './bricks';

export interface ProjectPlan {
  steps: PlanStep[];
  /** Capabilities the verified bricks cover. */
  satisfied: string[];
  /** Capabilities nothing provides → steps where the model writes original code. */
  glue: string[];
  /** Whether a known recipe shaped the plan (vs pure capability composition). */
  recipeKind?: string;
}

const clip = (s: string, n = 70) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/**
 * Plan a project end-to-end. Strategy:
 *  1. scaffold the starter,
 *  2. if a recipe matches, use its authored decomposed steps (highest quality),
 *  3. otherwise compose from the capability graph: a step per verified brick in
 *     dependency order, then a step per unmet capability (the glue),
 *  4. always end with an integration + verify step.
 */
export function planProject(goal: string, extraBricks: Brick[] = []): ProjectPlan {
  const recipe = recipeFor(goal);
  const needs = neededCapabilities(goal);
  const app = planApp(needs, [...APP_BRICKS, ...SEED_BRICKS, ...extraBricks]);

  const steps: PlanStep[] = [];
  steps.push({ title: 'Scaffold the project', task: `Create the starter files and layout for: ${goal}` });

  if (recipe?.steps?.length) {
    // Authored, decomposed plan for a known kind — each step is small + verifiable.
    for (const s of recipe.steps) steps.push({ title: clip(s), task: s });
  } else {
    // Capability composition: one grounded step per verified brick (deps first).
    for (const b of app.bricks) {
      steps.push({
        title: clip(b.title),
        task: `Add ${b.title} (provides: ${(b.provides ?? []).join(', ') || '—'}). Reuse this verified block and wire it in:\n${b.code.trim()}`,
      });
    }
    // Glue: capabilities no brick provides → the model writes these itself.
    for (const cap of app.glue) {
      steps.push({ title: clip(`Implement ${cap}`), task: `Implement the "${cap}" capability for: ${goal}.` });
    }
    // If neither bricks nor glue matched (unknown domain), fall back to a single build.
    if (!app.bricks.length && !app.glue.length) {
      steps.push({ title: 'Build the core', task: `Build the core functionality for: ${goal}` });
    }
  }

  steps.push({ title: 'Wire it together and verify', task: `Integrate all parts of "${goal}", make it run, and fix any errors until it works.` });

  return { steps, satisfied: app.satisfied, glue: app.glue, recipeKind: recipe?.kind };
}

/** Is a goal "hard/large" enough to warrant the long-horizon plan (vs a one-shot
 *  build)? Heuristic: multiple capabilities, an explicit multi-feature ask, or a
 *  recipe with a decomposed plan. Lets the caller pick planner vs single build. */
export function isLargeProject(goal: string): boolean {
  const needs = neededCapabilities(goal);
  const recipe = recipeFor(goal);
  const multiFeature = /\band\b|,|\bwith\b|\bplus\b/i.test(goal) && goal.split(/\s+/).length > 6;
  return needs.length >= 2 || (recipe?.steps?.length ?? 0) >= 3 || multiFeature;
}
