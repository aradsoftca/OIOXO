/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo Code P3 — retrieval (OIOXO_CODE.md P3): hand the coder EXACT signatures
 * from the real project so it never recalls/hallucinates an API. Two outputs:
 *   - the files most relevant to the task (full, for editing),
 *   - a symbol index of the rest (function/class/interface/type signatures) so
 *     the model knows what already exists to call.
 *
 * Lexical (no embeddings) for v1 — fast, on-device, no model. The TS compiler
 * (already a dep) extracts symbols robustly; relevance is task-term overlap
 * (same idea as the answer brain's brief). Node-testable.
 */
import type { CodeFile } from './codeloop';

export interface Symbol {
  file: string;
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'const';
  signature: string;
}

const CODE_RE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'or', 'in', 'on', 'for', 'with', 'make', 'add', 'fix', 'this', 'that', 'it', 'is', 'should', 'function', 'file', 'code', 'test', 'tests']);

const terms = (s: string) =>
  Array.from(new Set(s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 3 && !STOP.has(w))));

/** Extract top-level declared symbols + concise signatures via the TS compiler. */
export async function extractSymbols(files: CodeFile[]): Promise<Symbol[]> {
  const ts: any = (await import('typescript')).default ?? (await import('typescript'));
  const out: Symbol[] = [];
  const sigOf = (node: any, sf: any): string => {
    const text = node.getText(sf);
    // For functions/methods, drop the body: keep up to the return type / first '{'.
    const brace = text.indexOf('{');
    const sig = brace > 0 && /\)/.test(text.slice(0, brace)) ? text.slice(0, brace).trim() : text;
    return sig.replace(/\s+/g, ' ').slice(0, 280);
  };
  for (const f of files.filter((x) => CODE_RE.test(x.path))) {
    let sf: any;
    try { sf = ts.createSourceFile(f.path, f.content, ts.ScriptTarget.Latest, true); } catch { continue; }
    sf.forEachChild((node: any) => {
      const push = (name: string, kind: Symbol['kind']) => out.push({ file: f.path, name, kind, signature: sigOf(node, sf) });
      if (ts.isFunctionDeclaration(node) && node.name) push(node.name.text, 'function');
      else if (ts.isClassDeclaration(node) && node.name) push(node.name.text, 'class');
      else if (ts.isInterfaceDeclaration(node)) push(node.name.text, 'interface');
      else if (ts.isTypeAliasDeclaration(node)) push(node.name.text, 'type');
      else if (ts.isEnumDeclaration(node)) push(node.name.text, 'enum');
      else if (ts.isVariableStatement(node)) {
        for (const d of node.declarationList.declarations) if (d.name && ts.isIdentifier(d.name)) push(d.name.text, 'const');
      }
    });
  }
  return out;
}

export interface RetrievedContext {
  /** Files most relevant to the task — full content, for the model to edit. */
  relevantFiles: CodeFile[];
  /** A compact signature index of the project (what already exists to call). */
  symbolIndex: string;
}

/**
 * Pick the files most relevant to the task (by term overlap with path + content)
 * and build a signature index of the project. For a small project everything is
 * relevant; for a big one this keeps the prompt focused + grounded.
 */
export async function retrieveContext(
  task: string,
  files: CodeFile[],
  opts: { maxFiles?: number; maxSymbols?: number } = {},
): Promise<RetrievedContext> {
  const code = files.filter((f) => CODE_RE.test(f.path));
  const q = terms(task);
  const score = (f: CodeFile) => {
    const hay = new Set([...terms(f.path), ...terms(f.content)]);
    return q.filter((t) => hay.has(t)).length + (q.some((t) => f.path.toLowerCase().includes(t)) ? 2 : 0);
  };
  const ranked = [...code].sort((a, b) => score(b) - score(a));
  const relevantFiles = (ranked.some((f) => score(f) > 0) ? ranked.filter((f) => score(f) > 0) : ranked).slice(0, opts.maxFiles ?? 6);

  const symbols = await extractSymbols(files);
  // Rank symbols by task relevance too, so the index leads with what matters.
  const symScore = (s: Symbol) => q.filter((t) => s.name.toLowerCase().includes(t) || s.signature.toLowerCase().includes(t)).length;
  const idx = [...symbols].sort((a, b) => symScore(b) - symScore(a)).slice(0, opts.maxSymbols ?? 60);
  const symbolIndex = idx.map((s) => `${s.file} › ${s.kind} ${s.signature}`).join('\n');

  return { relevantFiles, symbolIndex };
}
