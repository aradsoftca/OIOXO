#!/usr/bin/env node
/**
 * Run the oioxo encrypt-search pipeline from inside newxonvert.
 *
 * The real script lives at repo-root scripts/encrypt-search.mjs. Locally we
 * spawn it with cwd=repo-root so it sees oioxo/ (its source) and writes the
 * .enc to oioxo/protected/. On the server we spawn it with cwd=newxonvert/
 * so it sees _oioxo_src/ (mirrored by sync-oioxo-source.mjs) and writes
 * _oioxo_src/protected/*.enc — which copy-oioxo-static.mjs then mirrors into
 * public/protected/.
 *
 * If repo-root scripts/encrypt-search.mjs is absent (server-side, since
 * deploy.py only tarballs newxonvert/), we ship a copy of it next to this
 * shim under newxonvert/scripts/encrypt-search.mjs. The deploy carries that
 * copy and it runs server-side from cwd=newxonvert.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEWXONVERT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(NEWXONVERT, '..');

// Local copy (always ships in the deploy tarball).
const LOCAL_SCRIPT = path.join(HERE, 'encrypt-search.mjs');
// Repo-root copy (single source of truth for local dev).
const ROOT_SCRIPT = path.join(REPO_ROOT, 'scripts', 'encrypt-search.mjs');

const useRoot = existsSync(ROOT_SCRIPT);
const script = useRoot ? ROOT_SCRIPT : LOCAL_SCRIPT;
// cwd must contain either oioxo/ (local) or _oioxo_src/ (server). Repo-root has
// oioxo/; newxonvert has _oioxo_src/. Pick the one that matches the script.
const cwd = useRoot ? REPO_ROOT : NEWXONVERT;

if (!existsSync(script)) {
  console.error(`[encrypt-oioxo] neither ${ROOT_SCRIPT} nor ${LOCAL_SCRIPT} exists`);
  process.exit(1);
}

console.log(`[encrypt-oioxo] running ${path.relative(REPO_ROOT, script) || script} (cwd=${path.basename(cwd)})`);
const r = spawnSync('node', [script], { cwd, stdio: 'inherit', env: process.env });
process.exit(r.status ?? 1);
