/**
 * oioxo Compute Mesh — WIRING (stage 8 binding). Binds the pure pools (coder-pool.ts,
 * verify-pool.ts) to real per-helper connections. As the app pairs each device it
 * obtains a coder handle (remote-coder.makePeerCoder) and/or an oracle handle
 * (remote-oracle.driveWithRemoteOracle), then registers it here against the helper's
 * fabric profile. The pools then call back through `generatorFor` / `runnerFor` to reach
 * the right device.
 *
 * The registration + routing is pure (the handles are injected), so this layer is
 * Node-testable on its own; only the handles themselves need a browser.
 */
import { HelperRegistry, type HelperProfile } from './mesh';
import { makeCoderPool, type CoderPoolOpts } from './coder-pool';
import { makeVerifyPool, type VerifyPoolOpts } from './verify-pool';
import type { GenerateFn, RunFn, Edit, RunResult } from './codeloop';

/** The minimal slice of a remote-coder handle the pool needs. */
export interface GeneratorHandle { generate: GenerateFn; cancel?: () => void; }
/** The minimal slice of a remote-oracle handle the pool needs. */
export interface OracleHandle { run: RunFn; cancel?: () => void; }

const NO_EDITS: Edit[] = [];
const helperGone: RunResult = { ok: false, output: '', errors: 'helper disconnected' };

/**
 * Holds the live fabric + the per-helper handles, and hands the pools their callbacks.
 * One per coding session. Add helpers as they pair, remove them as they drop — the
 * registry's churn handling + the pools' timeouts cover the in-flight cases.
 */
export class MeshClient {
  readonly registry: HelperRegistry;
  private readonly generators = new Map<string, GeneratorHandle>();
  private readonly oracles = new Map<string, OracleHandle>();

  constructor(registry?: HelperRegistry) {
    this.registry = registry ?? new HelperRegistry();
  }

  /** Register a paired device that can GENERATE (its profile must include 'generate'). */
  addGenerator(profile: HelperProfile, handle: GeneratorHandle): void {
    this.registry.add(profile);
    this.generators.set(profile.id, handle);
  }

  /** Register a paired device that can VERIFY (profile must include 'verify'). */
  addVerifier(profile: HelperProfile, handle: OracleHandle): void {
    this.registry.add(profile);
    this.oracles.set(profile.id, handle);
  }

  /** A device dropped — close its handles + remove it from the fabric. */
  remove(id: string): void {
    this.generators.get(id)?.cancel?.();
    this.oracles.get(id)?.cancel?.();
    this.generators.delete(id);
    this.oracles.delete(id);
    this.registry.remove(id);
  }

  /** Temporarily mark a device asleep/awake (kept registered, excluded from selection). */
  setAvailable(id: string, available: boolean): void {
    this.registry.setAvailable(id, available);
  }

  /** The per-helper generator the coder pool calls. A missing handle → empty (the pool
   *  records a failure and routes around it). */
  readonly generatorFor = (id: string): GenerateFn => {
    const h = this.generators.get(id);
    return h ? h.generate : async () => NO_EDITS;
  };

  /** The per-helper runner the verify pool calls. */
  readonly runnerFor = (id: string): RunFn => {
    const h = this.oracles.get(id);
    return h ? h.run : async () => helperGone;
  };

  /** Build a pooled GenerateFn across all generate-capable helpers (race by default). */
  coderPool(opts: Partial<Omit<CoderPoolOpts, 'registry' | 'generatorFor'>> = {}): GenerateFn {
    return makeCoderPool({ registry: this.registry, generatorFor: this.generatorFor, ...opts });
  }

  /** Build a pooled RunFn across all verify-capable helpers (fastest by default). */
  verifyPool(opts: Partial<Omit<VerifyPoolOpts, 'registry' | 'runnerFor'>> = {}): RunFn {
    return makeVerifyPool({ registry: this.registry, runnerFor: this.runnerFor, ...opts });
  }

  /** Counts for the UI ("earning · 3 devices"). */
  stats(): { generators: number; verifiers: number; total: number } {
    return { generators: this.generators.size, verifiers: this.oracles.size, total: this.registry.all().length };
  }
}
