/**
 * oioxo Agentic IDE (AGENTIC_IDE.md §8.3) — scaffold a project FROM NOTHING. The
 * agent starts not from an empty void but from a minimal, runnable template chosen
 * for the goal, then the loop fills it in + verifies. This is what turns "build me
 * X" into a running project (with a live preview) instead of a code block in a chat.
 *
 * Templates are intentionally tiny + runnable on their own: a static web app
 * previews instantly (no install); a node project has a test the loop can drive.
 * Pure + Node-testable.
 */
import type { CodeFile } from './codeloop';

export type Template = 'web' | 'node';

export interface Scaffold {
  template: Template;
  /** The command that runs/serves it (drives preview or the oracle). */
  runCmd: string;
  /** True if it serves a web preview (vs a CLI/test project). */
  preview: boolean;
  files: CodeFile[];
}

/** Heuristically pick a template from the goal text. Web is the default because it
 *  previews instantly; node/CLI/API/test-ish goals get the node template. */
export function pickTemplate(goal: string): Template {
  const g = goal.toLowerCase();
  if (/\b(cli|command[- ]?line|script|api|server|library|package|npm|node|backend|function)\b/.test(g)) return 'node';
  return 'web';
}

const WEB = (title: string): CodeFile[] => [
  {
    path: 'index.html',
    content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main id="app"></main>
  <script src="script.js"></script>
</body>
</html>
`,
  },
  {
    path: 'style.css',
    content: `:root { color-scheme: light; font-family: system-ui, sans-serif; }
body { margin: 0; display: grid; place-items: center; min-height: 100vh; background: #fff; color: #18181b; }
#app { padding: 2rem; }
`,
  },
  {
    path: 'script.js',
    content: `// ${title} — entry. The agent builds the app out from here.
document.getElementById('app').textContent = 'Hello from ${title}';
`,
  },
  { path: 'README.md', content: `# ${title}\n\nA web app scaffolded by oioxo. Open index.html (the preview serves it).\n` },
];

const NODE = (name: string): CodeFile[] => [
  {
    path: 'package.json',
    content: JSON.stringify(
      { name, version: '0.1.0', type: 'module', scripts: { test: 'node --test', start: 'node index.js' } },
      null,
      2,
    ) + '\n',
  },
  { path: 'index.js', content: `// ${name} — entry.\nexport function main() {\n  return 'ok';\n}\n\nif (import.meta.url === \`file://\${process.argv[1]}\`) console.log(main());\n` },
  {
    path: 'index.test.js',
    content: `import { test } from 'node:test';\nimport assert from 'node:assert';\nimport { main } from './index.js';\n\ntest('main runs', () => {\n  assert.equal(typeof main(), 'string');\n});\n`,
  },
  { path: 'README.md', content: `# ${name}\n\nA Node project scaffolded by oioxo. \`npm test\` is the oracle the agent builds against.\n` },
];

/** Build the starting project for a goal. `name` defaults to a slug of the goal. */
export function scaffold(goal: string, name?: string): Scaffold {
  const template = pickTemplate(goal);
  const slug = (name || goal).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'app';
  if (template === 'node') {
    return { template, runCmd: 'npm test', preview: false, files: NODE(slug) };
  }
  return { template, runCmd: 'npx --yes serve -l 3111 .', preview: true, files: WEB(name || goal.slice(0, 60)) };
}
