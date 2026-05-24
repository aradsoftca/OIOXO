/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo Code — the RUNNER side of the loop (OIOXO_CODE.md §2 step 4): the device
 * as oracle. Mounts the working files into the WebContainer sandbox, runs the
 * test/build command, and reports pass/fail + errors. This is the ground truth
 * the repair loop trusts.
 */
import { mountTree, run, parseCommand, runSupported } from './webcontainer';
import { extractErrors, type CodeFile, type RunFn, type RunResult } from './codeloop';

export { runSupported };

/** CodeFile[] → WebContainer FileSystemTree (nested directory/file nodes). Pure. */
export function filesToTree(files: CodeFile[]): any {
  const tree: any = {};
  for (const f of files) {
    const parts = f.path.split('/').filter(Boolean);
    if (!parts.length) continue;
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      if (!node[dir]?.directory) node[dir] = { directory: {} };
      node = node[dir].directory;
    }
    node[parts[parts.length - 1]] = { file: { contents: f.content } };
  }
  return tree;
}

/**
 * A RunFn that executes on-device via WebContainer: mount the files, run the
 * command, capture output, and treat exit code 0 as the pass signal. `onData`
 * streams the live log to the UI. Re-mounting each cycle overwrites changed
 * source while node_modules (not in the tree) persists from an earlier install.
 */
export function makeWebContainerRun(onData?: (chunk: string) => void): RunFn {
  return async (files: CodeFile[], cmd: string): Promise<RunResult> => {
    await mountTree(filesToTree(files));
    const [c, args] = parseCommand(cmd);
    let output = '';
    const exit = await run(c, args, (chunk) => {
      output += chunk;
      onData?.(chunk);
    });
    const ok = exit === 0;
    return { ok, output, errors: ok ? '' : extractErrors(output) };
  };
}
