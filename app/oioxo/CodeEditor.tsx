'use client';
/**
 * oioxo Code — the editor surface. Monaco (the engine behind VS Code), **self-hosted
 * from our own origin** (`/monaco/vs`, copied by scripts/copy-monaco.mjs) — never a
 * CDN, so it mounts fast, works offline, and keeps the host-nothing promise. If the
 * assets are somehow unreachable it still degrades to a plain textarea so editing
 * never dies.
 *
 * It also renders DIAGNOSTICS as native squiggles: pass `diagnostics` for the open
 * file (from lib/oioxo/typecheck) and they show as error/warning markers, click-to-
 * line via the Problems panel that uses the same data.
 */
import * as React from 'react';
import dynamic from 'next/dynamic';
import { loader, type Monaco, type OnMount } from '@monaco-editor/react';
import type { CodeFile } from '@/lib/oioxo/codeloop';
import { useEditorSettings } from './EditorSettings';

const TS_RE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const fileUri = (monaco: Monaco, path: string) => monaco.Uri.parse('file:///' + path.replace(/^\/+/, ''));

// Point Monaco's AMD loader at our self-hosted copy (set once, before first load).
// Honor a deploy basePath (NEXT_PUBLIC_BASE_PATH) so /monaco/vs resolves correctly
// whether the app is served at root or under a subpath.
if (typeof window !== 'undefined') {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  loader.config({ paths: { vs: `${window.location.origin}${base}/monaco/vs` } });
}

const Editor = dynamic(() => import('@monaco-editor/react').then((m) => m.Editor), {
  ssr: false,
  loading: () => <div className="grid h-full flex-1 place-items-center text-sm text-zinc-400">Loading editor…</div>,
});

const LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', css: 'css', scss: 'scss', html: 'html', md: 'markdown',
  py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', h: 'c', cpp: 'cpp',
  sh: 'shell', bash: 'shell', yml: 'yaml', yaml: 'yaml', toml: 'ini', sql: 'sql',
};

function langFor(name?: string): string {
  const ext = name?.split('.').pop()?.toLowerCase() ?? '';
  return LANG[ext] ?? 'plaintext';
}

/** One diagnostic for the currently open file (a subset of typecheck.TypeDiag). */
export interface EditorDiag {
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export default function CodeEditor({
  value,
  onChange,
  filename,
  diagnostics,
  onSave,
  revealAt,
  path,
  projectFiles,
}: {
  value: string;
  onChange: (next: string) => void;
  filename?: string;
  /** Diagnostics for THIS file → rendered as Monaco markers (squiggles). */
  diagnostics?: EditorDiag[];
  /** Cmd/Ctrl+S inside the editor. */
  onSave?: () => void;
  /** Bump `key` to scroll to + focus a line/column (Problems-panel jump). */
  revealAt?: { line: number; column: number; key: number };
  /** Full project path of the open file — gives it a `file:///` model URI so
   *  cross-file IntelliSense (completions/hover/go-to-def) can resolve imports. */
  path?: string;
  /** Every project file — registered as sibling Monaco models so the TS worker
   *  sees the whole project (not just the open file). Enables cross-file IntelliSense. */
  projectFiles?: CodeFile[];
}) {
  const [failed, setFailed] = React.useState(false);
  const [settings] = useEditorSettings();
  const monacoRef = React.useRef<Monaco | null>(null);
  const editorRef = React.useRef<Parameters<OnMount>[0] | null>(null);
  const onSaveRef = React.useRef(onSave);
  onSaveRef.current = onSave;

  // Degrade to a textarea only if Monaco truly never mounts (now fast + local, so a
  // short timeout is fine — the CDN-era 8s dead pane was the bug we're fixing).
  React.useEffect(() => {
    if (editorRef.current) return;
    const t = setTimeout(() => { if (!editorRef.current) setFailed(true); }, 4000);
    return () => clearTimeout(t);
  }, []);

  // Push diagnostics → markers whenever they (or the model) change.
  const applyMarkers = React.useCallback(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!monaco || !model) return;
    const sev = monaco.MarkerSeverity;
    monaco.editor.setModelMarkers(model, 'oioxo', (diagnostics ?? []).map((d) => ({
      startLineNumber: d.line, startColumn: d.column,
      endLineNumber: d.endLine ?? d.line, endColumn: d.endColumn ?? d.column + 1,
      message: d.message,
      severity: d.severity === 'error' ? sev.Error : d.severity === 'warning' ? sev.Warning : sev.Info,
    })));
  }, [diagnostics]);
  React.useEffect(() => { applyMarkers(); }, [applyMarkers]);

  // Cross-file IntelliSense: mirror every project file into a Monaco `file:///`
  // model so the TS worker resolves imports across files (completions, hover,
  // go-to-def). Never let this break the editor — it's a pure enhancement.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco || !projectFiles) return;
    try {
      const active = editorRef.current?.getModel();
      const wanted = new Set<string>();
      for (const f of projectFiles) {
        if (!TS_RE.test(f.path)) continue;
        const uri = fileUri(monaco, f.path);
        wanted.add(uri.toString());
        const existing = monaco.editor.getModel(uri);
        if (!existing) monaco.editor.createModel(f.content, langFor(f.path), uri);
        else if (existing !== active && existing.getValue() !== f.content) existing.setValue(f.content);
      }
      // dispose sibling models for files that went away (never the open one)
      for (const m of monaco.editor.getModels()) {
        if (m.uri.scheme === 'file' && m !== active && !wanted.has(m.uri.toString())) m.dispose();
      }
    } catch { /* IntelliSense is best-effort — editing must never break */ }
  }, [projectFiles, mounted]);

  // Jump to a line/column when the Problems panel asks (revealAt.key bumps).
  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !revealAt) return;
    editor.revealLineInCenter(revealAt.line);
    editor.setPosition({ lineNumber: revealAt.line, column: revealAt.column });
    editor.focus();
  }, [revealAt?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); onSaveRef.current?.(); } }}
        spellCheck={false}
        className="min-h-0 flex-1 resize-none bg-white p-3 font-mono text-[13px] leading-relaxed text-zinc-800 focus:outline-none"
      />
    );
  }

  return (
    <div className="min-h-0 flex-1">
      <Editor
        language={langFor(filename)}
        path={path ? 'file:///' + path.replace(/^\/+/, '') : undefined}
        keepCurrentModel
        value={value}
        onChange={(v) => onChange(v ?? '')}
        beforeMount={(monaco) => {
          monacoRef.current = monaco;
          // Our project-wide oracle (lib/oioxo/typecheck) owns diagnostics. Turn OFF
          // Monaco's built-in single-file TS/JS validation so it can't show false
          // "cannot find module './x'" errors for multi-file projects — completions
          // and hover stay on; only the (isolated, wrong) squiggles go off.
          const t = monaco.languages.typescript;
          const off = { noSemanticValidation: true, noSyntaxValidation: true };
          t.typescriptDefaults.setDiagnosticsOptions(off);
          t.javascriptDefaults.setDiagnosticsOptions(off);
          // Compiler options so cross-file completions/imports resolve sensibly.
          const opts = {
            target: t.ScriptTarget.ES2020,
            module: t.ModuleKind.ESNext,
            moduleResolution: t.ModuleResolutionKind.NodeJs,
            jsx: t.JsxEmit.ReactJSX,
            allowJs: true, esModuleInterop: true, allowNonTsExtensions: true,
          };
          t.typescriptDefaults.setCompilerOptions(opts);
          t.javascriptDefaults.setCompilerOptions(opts);
          // Brand dark theme (gold-on-near-black) to match the rest of oioxo.
          monaco.editor.defineTheme('oioxo-dark', {
            base: 'vs-dark', inherit: true, rules: [],
            colors: {
              'editor.background': '#1b1b1f',
              'editor.foreground': '#e6e3dc',
              'editorLineNumber.foreground': '#5a5a64',
              'editorCursor.foreground': '#E2B24A',
              'editor.selectionBackground': '#E2B24A33',
              'editor.lineHighlightBackground': '#26262c',
              'editorWidget.background': '#1b1b1f',
              'editorIndentGuide.background1': '#2c2c33',
            },
          });
        }}
        onMount={(editor, monaco) => {
          editorRef.current = editor;
          monacoRef.current = monaco;
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSaveRef.current?.());
          applyMarkers();
          setMounted(true);
        }}
        theme={settings.theme}
        height="100%"
        options={{
          minimap: { enabled: settings.minimap },
          fontSize: settings.fontSize,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: settings.tabSize,
          wordWrap: settings.wordWrap ? 'on' : 'off',
          smoothScrolling: true,
          padding: { top: 10 },
          renderLineHighlight: 'line',
        }}
      />
    </div>
  );
}
