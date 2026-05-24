'use client';
/**
 * oioxo Code — the editor surface. Monaco (the engine behind VS Code) for a
 * pro-grade editing feel: syntax highlighting, multi-cursor, the lot. Lazy-loaded
 * client-only. If Monaco can't load (e.g. fully offline and the CDN is
 * unreachable), it falls back to a plain textarea so editing still works — the
 * offline-first promise holds.
 */
import * as React from 'react';
import dynamic from 'next/dynamic';

const Monaco = dynamic(() => import('@monaco-editor/react').then((m) => m.Editor), {
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

export default function CodeEditor({
  value,
  onChange,
  filename,
}: {
  value: string;
  onChange: (next: string) => void;
  filename?: string;
}) {
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  // If Monaco never mounts (offline / CDN blocked), degrade to a textarea.
  React.useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setReady((r) => (r ? r : (setFailed(true), false))), 8000);
    return () => clearTimeout(t);
  }, [ready]);

  if (failed) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="min-h-0 flex-1 resize-none bg-white p-3 font-mono text-[13px] leading-relaxed text-zinc-800 focus:outline-none"
      />
    );
  }

  return (
    <div className="min-h-0 flex-1">
      <Monaco
        language={langFor(filename)}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        onMount={() => setReady(true)}
        theme="light"
        height="100%"
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          smoothScrolling: true,
          padding: { top: 10 },
          renderLineHighlight: 'line',
        }}
      />
    </div>
  );
}
