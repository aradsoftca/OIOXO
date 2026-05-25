/**
 * oioxo Agentic IDE (AGENTIC_IDE.md §8.3) — scaffold a project FROM NOTHING. The
 * agent starts not from an empty void but from a minimal, runnable template chosen
 * for the goal, then the loop fills it in + verifies. This is what turns "build me
 * X" into a running project (with a live preview) instead of a code block in a chat.
 *
 * Templates are intentionally tiny + runnable. Most preview INSTANTLY with no
 * install (static web/game/canvas, a pure-Node API, a Node test project); the
 * React/Vite one needs a one-time `npm install` (the `setup` step) before its dev
 * server. Pure + Node-testable.
 */
import type { CodeFile } from './codeloop';

export type Template = 'web' | 'react' | 'node' | 'api' | 'game' | 'python';

export interface Scaffold {
  template: Template;
  /** Which on-device interpreter runs it: Node (WebContainer) or Python (Pyodide). */
  runtime?: 'node' | 'python';
  /** Optional one-time setup run before `runCmd` (e.g. "npm install"). */
  setup?: string;
  /** The command that runs/serves it (drives preview or the oracle). */
  runCmd: string;
  /** True if it serves a web preview (vs a CLI/test project). */
  preview: boolean;
  /** True for purely static projects (web/game): the IDE serves them with its
   *  built-in zero-install static server for an INSTANT preview, ignoring runCmd.
   *  False for projects that start their own server (api/react dev server). */
  staticServe?: boolean;
  files: CodeFile[];
}

/** Heuristically pick a template from the goal text. Order matters: more specific
 *  cues win. Defaults to the instant-preview static web template. */
export function pickTemplate(goal: string): Template {
  const g = goal.toLowerCase();
  if (/\b(python|py|pandas|numpy|matplotlib|flask|django|pytest|jupyter|\.py)\b/.test(g)) return 'python';
  if (/\b(react|jsx|component|hooks?|spa|single[- ]page|next\.?js|vite)\b/.test(g)) return 'react';
  if (/\b(game|canvas|sprite|snake|pong|tetris|platformer|physics|2d|animation loop)\b/.test(g)) return 'game';
  if (/\b(api|server|backend|endpoint|rest|graphql|webhook|microservice|express)\b/.test(g)) return 'api';
  if (/\b(cli|command[- ]?line|script|library|package|npm|node module|parser|algorithm|function|util)\b/.test(g)) return 'node';
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
  { path: 'README.md', content: `# ${title}\n\nA web app scaffolded by oioxo. The preview serves index.html.\n` },
];

const GAME = (title: string): CodeFile[] => [
  {
    path: 'index.html',
    content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0b0b10; display: grid; place-items: center; }
    canvas { background: #15151f; border-radius: 12px; box-shadow: 0 8px 40px #0008; }
  </style>
</head>
<body>
  <canvas id="game" width="480" height="320"></canvas>
  <script src="game.js"></script>
</body>
</html>
`,
  },
  {
    path: 'game.js',
    content: `// ${title} — a canvas game loop. The agent builds the gameplay out from here.
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let t = 0;
function frame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#E2B24A';
  const x = canvas.width / 2 + Math.cos(t) * 80;
  const y = canvas.height / 2 + Math.sin(t) * 80;
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fill();
  t += 0.03;
  requestAnimationFrame(frame);
}
frame();
`,
  },
  { path: 'README.md', content: `# ${title}\n\nA canvas game scaffolded by oioxo. Edit game.js; the preview reloads.\n` },
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

const API = (name: string): CodeFile[] => [
  {
    path: 'package.json',
    content: JSON.stringify(
      { name, version: '0.1.0', type: 'module', scripts: { start: 'node server.js', test: 'node --test' } },
      null,
      2,
    ) + '\n',
  },
  {
    path: 'server.js',
    content: `// ${name} — a zero-dependency HTTP API. The agent adds routes here.
import http from 'node:http';

const routes = {
  'GET /': () => ({ ok: true, service: '${name}' }),
  'GET /health': () => ({ status: 'up' }),
};

export function handle(method, path) {
  const fn = routes[\`\${method} \${path}\`];
  return fn ? { status: 200, body: fn() } : { status: 404, body: { error: 'not found' } };
}

const server = http.createServer((req, res) => {
  const { status, body } = handle(req.method, (req.url || '/').split('?')[0]);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
});
server.listen(3111, () => console.log('API ready on 3111'));
`,
  },
  {
    path: 'server.test.js',
    content: `import { test } from 'node:test';\nimport assert from 'node:assert';\nimport { handle } from './server.js';\n\ntest('GET / responds ok', () => {\n  assert.equal(handle('GET', '/').status, 200);\n});\ntest('unknown route is 404', () => {\n  assert.equal(handle('GET', '/nope').status, 404);\n});\n`,
  },
  { path: 'README.md', content: `# ${name}\n\nA Node HTTP API scaffolded by oioxo. The preview hits the running server; \`npm test\` checks the route table.\n` },
];

const REACT = (name: string): CodeFile[] => [
  {
    path: 'package.json',
    content: JSON.stringify(
      {
        name, private: true, version: '0.1.0', type: 'module',
        scripts: { dev: 'vite --host --port 3111', build: 'vite build', preview: 'vite preview' },
        dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
        devDependencies: { '@vitejs/plugin-react': '^4.3.1', vite: '^5.4.0' },
      },
      null,
      2,
    ) + '\n',
  },
  { path: 'vite.config.js', content: `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });\n` },
  {
    path: 'index.html',
    content: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${name}</title></head>
<body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body>
</html>
`,
  },
  { path: 'src/main.jsx', content: `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App.jsx';\ncreateRoot(document.getElementById('root')).render(<App />);\n` },
  {
    path: 'src/App.jsx',
    content: `import { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <main style={{ fontFamily: 'system-ui', display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <h1>${name}</h1>
      <button onClick={() => setCount((c) => c + 1)}>count is {count}</button>
    </main>
  );
}
`,
  },
  { path: 'README.md', content: `# ${name}\n\nA React + Vite app scaffolded by oioxo. The agent builds components in src/.\n` },
];

const PYTHON = (name: string): CodeFile[] => [
  {
    path: 'main.py',
    content: `"""${name} — entry. The agent builds it out from here; it runs on-device."""


def main() -> None:
    print("Hello from ${name}")


if __name__ == "__main__":
    main()
`,
  },
  { path: 'README.md', content: `# ${name}\n\nA Python project scaffolded by oioxo. Runs on-device via Pyodide — no install. \`main.py\` is the entry.\n` },
];

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'app';

/** Build the starting project for a goal. `name` defaults to a slug of the goal. */
export function scaffold(goal: string, name?: string): Scaffold {
  const template = pickTemplate(goal);
  const slug = slugify(name || goal);
  const title = name || goal.slice(0, 60);
  switch (template) {
    case 'python':
      return { template, runtime: 'python', runCmd: 'python main.py', preview: false, files: PYTHON(slug) };
    case 'node':
      return { template, runCmd: 'npm test', preview: false, files: NODE(slug) };
    case 'api':
      return { template, runCmd: 'node server.js', preview: true, files: API(slug) };
    case 'game':
      return { template, runCmd: 'npx --yes serve -l 3111 .', preview: true, staticServe: true, files: GAME(title) };
    case 'react':
      return { template, setup: 'npm install', runCmd: 'npm run dev', preview: true, files: REACT(slug) };
    case 'web':
    default:
      return { template, runCmd: 'npx --yes serve -l 3111 .', preview: true, staticServe: true, files: WEB(title) };
  }
}

/** A human label for a template (UI). */
export function templateLabel(t: Template): string {
  return { web: 'Web app', react: 'React app', node: 'Node project', api: 'HTTP API', game: 'Canvas game', python: 'Python project' }[t];
}
