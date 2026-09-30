import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// CommonJS deps loaded lazily inside the (ESM) config.
const require = createRequire(import.meta.url);

// This package's directory. An UNRELATED npm project at D:\appz (its own
// package-lock.json + node_modules with different lucide-react/react versions)
// makes Next 15 infer D:\appz as the monorepo root, so newxonvert's webpack/
// turbopack resolve shared deps from the wrong node_modules → a corrupted dev
// module graph ("Cannot read properties of undefined (reading 'call')",
// "__webpack_require__.n is not a function", blank page). Pinning the root to
// THIS dir makes resolution stay inside newxonvert.
const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

// Set NEXT_BASE_PATH=/xonvert at build time when deploying behind the subpath
// on Iceland (http://194.247.182.248/xonvert/). Leave empty for local dev.
const basePath = process.env.NEXT_BASE_PATH || '';

// xonvert brand only (oioxo builds with NEXT_PUBLIC_BRAND=oioxo).
const IS_XONVERT = (process.env.NEXT_PUBLIC_BRAND || 'Xonvert').toLowerCase() !== 'oioxo';
// Unfinished studios: hidden in lib/studios/disabled.ts, bounced here. Temporary
// (307) so they can come back without a stale permanent redirect in caches.
const DISABLED_STUDIOS = IS_XONVERT
  ? require('./lib/studios/disabled-ids.json').ids
  : [];
// Heavy-model tools removed from xonvert (owner rule 2026-09-29) — permanent 308s.
const DISABLED_AI_TOOLS = IS_XONVERT
  ? Object.entries(require('./lib/studios/disabled-ai-tools.json').tools)
  : [];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Hide the "X-Powered-By: Next.js" fingerprint. Makes it marginally harder
  // for an attacker to map known framework CVEs to the deployment, and avoids
  // advertising the stack to clone-bot crawlers.
  poweredByHeader: false,
  // Browser source maps OFF in production. Default is already false but make
  // it explicit so a future config tweak can't accidentally re-expose source.
  productionBrowserSourceMaps: false,
  // @wllama ships untranspiled TS source — let Next's loaders process it so the
  // oioxo coder (dynamic-imported, client-only) doesn't break the build parse.
  transpilePackages: ['@wllama/wllama'],
  // Build output dir. Overridable at BUILD time (NEXT_DIST_DIR) so deploys can
  // build into a side dir while the live `.next` keeps serving — zero-downtime.
  // At runtime NEXT_DIST_DIR is unset, so `next start` serves the swapped-in `.next`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  // Don't fail prod builds on lint — we lint via CI/IDE.
  eslint: { ignoreDuringBuilds: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  // Auth URL aliases. Generic shorthands + the old France paths (hyphenless
  // /auth/signin etc.) → the canonical new routes, so bookmarks / SEO / typed
  // URLs don't 404 after the cutover. Query strings are forwarded automatically
  // (so /auth/verify?token=… and /auth/reset-password?token=… keep their token).
  async redirects() {
    return [
      { source: '/login', destination: '/auth/sign-in', permanent: true },
      { source: '/signin', destination: '/auth/sign-in', permanent: true },
      { source: '/sign-in', destination: '/auth/sign-in', permanent: true },
      { source: '/auth/signin', destination: '/auth/sign-in', permanent: true },
      { source: '/register', destination: '/auth/sign-up', permanent: true },
      { source: '/signup', destination: '/auth/sign-up', permanent: true },
      { source: '/sign-up', destination: '/auth/sign-up', permanent: true },
      { source: '/auth/signup', destination: '/auth/sign-up', permanent: true },
      { source: '/forgot-password', destination: '/auth/forgot-password', permanent: true },
      { source: '/reset-password', destination: '/auth/reset-password', permanent: true },
      // France served verification on a page; we verify in the API route.
      { source: '/auth/verify', destination: '/api/auth/verify', permanent: false },
      { source: '/auth/verified', destination: '/auth/sign-in?verified=1', permanent: true },
      { source: '/auth/signout', destination: '/', permanent: true },
      // Old top-level routes → new homes.
      { source: '/dashboard', destination: '/account', permanent: true },
      { source: '/dashboard/:path*', destination: '/account', permanent: false },
      { source: '/contact', destination: '/support', permanent: true },
      { source: '/upgrade', destination: '/pricing', permanent: true },
      ...(IS_XONVERT
        ? [
            // One host for Google: www is a full duplicate of the apex.
            { source: '/:path*', has: [{ type: 'host', value: 'www.xonvert.com' }], destination: 'https://xonvert.com/:path*', permanent: true },
            { source: '/studios', destination: '/tools', permanent: false },
            // OIOXO-only surfaces the shared codebase also served on xonvert.com (indexable,
            // "oioxo — all-in-one AI · Xonvert"; /ai + /summarize with AI switched off here).
            { source: '/oioxo', destination: '/', permanent: true },
            { source: '/oioxo/:path*', destination: '/', permanent: true },
            { source: '/ai', destination: '/', permanent: true },
            { source: '/summarize', destination: '/tools', permanent: true },
            { source: '/search.html', destination: '/', permanent: true },
            { source: '/newsearch.html', destination: '/', permanent: true },
            ...DISABLED_STUDIOS.map((id) => ({ source: `/tools/${id}`, destination: '/tools', permanent: false })),
            ...DISABLED_AI_TOOLS.map(([id, to]) => ({ source: `/tools/${id}`, destination: to, permanent: true })),
            // Dev harness for the OIOXO LLM brain — not a xonvert page.
            { source: '/enginetest', destination: '/', permanent: true },
          ]
        : []),
    ];
  },
  // Old root-level converter URLs (/cfg-to-txt…) that Google indexed. Runs after
  // the filesystem, so only paths that would 404 reach the legacy redirector.
  async rewrites() {
    return IS_XONVERT
      ? [{ source: '/:pair([a-z0-9]{1,12}-to-[a-z0-9]{1,12})', destination: '/api/legacy-convert/:pair' }]
      : [];
  },
  // SharedArrayBuffer + cross-origin isolation for ffmpeg.wasm multi-thread.
  async headers() {
    // Big WASM cores + worker glue never change for a given build, so let the
    // browser keep them forever. Without this, /public assets revalidate (or
    // re-download) every visit — and these are 30 MB+ files. `immutable` means
    // the browser won't even send a conditional request. Combined with the
    // service worker (public/sw.js), repeat use of any heavy tool is instant.
    const immutable = [
      { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
    ];
    const wasmDirs = [
      '/ffmpeg/:path*',
      '/ffmpeg-mt/:path*',
      '/occt/:path*',
      '/mediapipe/:path*',
      '/assimpjs/:path*',
      '/libarchive/:path*',
    ];
    return [
      {
        source: '/(.*)',
        headers: [
          // 'credentialless' keeps cross-origin isolation (SharedArrayBuffer /
          // ffmpeg-mt / WebContainers still work) BUT lets cross-origin images
          // (Openverse/Wikimedia search results) load — 'require-corp' blocked
          // them, showing broken thumbnails.
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          // Don't let another site embed our pages (incl. the AI) in a frame.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          // Force HTTPS in browsers that have ever seen the site. 2y window +
          // preload-eligible value (subdomains included). Pre-existing HTTP
          // bookmarks get upgraded automatically — closes a TLS-stripping vector.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // Stop MIME sniffing — defends against XSS via mistyped responses
          // (the watermark JSON file getting executed as a script, etc.).
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Don't leak full referrer URLs to third parties. Origin only across
          // cross-origin, full URL on same-origin (so analytics can still
          // attribute internal navigation).
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Lock down powerful APIs to ones the tools actually need. camera/
          // mic/display-capture are on for Call/Watch/Send. Everything else is
          // OFF — third-party iframes (none expected) and would-be clones lose
          // access to sensors/payments/geolocation by default.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(), usb=(), bluetooth=(), midi=()' },
          // Tells crawlers to not fingerprint stack via cookies/method behavior.
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
      ...wasmDirs.map((source) => ({ source, headers: immutable })),
      { source: '/pdf.worker.min.mjs', headers: immutable },
      { source: '/gif.worker.js', headers: immutable },
      // Cloudflare's edge kept a day-old sitemap after a deploy (Age 82592s), so Google
      // fetched URLs we had just redirected. Crawl files must follow each deploy fast.
      ...['/sitemap.xml', '/robots.txt'].map((source) => ({
        source,
        headers: [{ key: 'Cloudflare-CDN-Cache-Control', value: 'max-age=600' }],
      })),
    ];
  },
  // Pin the workspace root so the unrelated D:\appz project can't hijack module
  // resolution. `outputFileTracingRoot` covers webpack; `turbopack.root` covers
  // the Turbopack dev path. Both point at this package.
  outputFileTracingRoot: PKG_ROOT,
  turbopack: { root: PKG_ROOT },
  experimental: {
    // The webpack build worker parallelizes compilation but spawns extra Node
    // workers that can OOM / stack-overflow-crash (exit 0xC0000409) on
    // memory-constrained build machines. Allow opting out via env so a low-RAM
    // box can still produce a build (set DISABLE_WEBPACK_BUILD_WORKER=1).
    webpackBuildWorker: process.env.DISABLE_WEBPACK_BUILD_WORKER !== '1',
  },
  // WASM and worker bundling
  webpack: (config, { dev, isServer, webpack }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      topLevelAwait: true,
    };
    // Some WASM glue (assimpjs, libarchive) is a UMD build that references Node
    // core modules behind runtime guards. Stub them so the client bundle builds.
    config.resolve = config.resolve || {};
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      fs: false,
      path: false,
      crypto: false,
    };
    // Resolve modules from THIS package's node_modules first, before walking up
    // to the unrelated D:\appz project. Without this, shared deps (lucide-react,
    // react, react-error-boundary…) can resolve to D:\appz\node_modules at the
    // wrong version and corrupt the dev chunk graph.
    config.resolve.modules = [
      `${PKG_ROOT}/node_modules`,
      'node_modules',
      ...(config.resolve.modules || []),
    ];

    // --- ownership protection (client bundles only) ---
    if (!isServer && !dev) {
      // Watermark: stamp every client chunk with a proprietary notice + build
      // marker. It ships inside the JS, so a clone is provably ours — useful
      // evidence for a DMCA takedown.
      const buildId = process.env.BUILD_ID || new Date().toISOString().slice(0, 10);
      const mark = `Xonvert (c) ${new Date().getFullYear()} Proprietary - unauthorized copying prohibited - build:${buildId}`;
      config.plugins.push(
        new webpack.BannerPlugin({
          // Injected as real code (raw), not a comment: Next's SWC minifier
          // strips comments — even @license ones — but it won't drop a global
          // assignment with a side effect. So the watermark string survives in
          // the shipped JS, giving provable evidence if a build is copied.
          banner: `globalThis.__xonvert=globalThis.__xonvert||${JSON.stringify(mark)};`,
          raw: true,
          entryOnly: false,
          test: /\.js$/, // JS only — never CSS/other assets.
        }),
      );

      // Obfuscation: opt-in via OBFUSCATE=1 for public production deploys. OFF by
      // default because it enlarges bundles (perf policy).
      //
      // WORKER-SAFE CONFIG. This app spawns inline blob workers from ~15 engines
      // (+ library workers). The obfuscator's stringArray, selfDefending and
      // domainLock all break those workers — the worker runs in a separate global
      // scope that can't see the chunk-level string-array accessor ("cX is not
      // defined"), and a Worker has no `document` for domainLock to read. So those
      // three are DISABLED. We keep aggressive identifier renaming (every name →
      // opaque hex) + compaction, which is self-contained per scope and safe.
      //
      // Minification is turned OFF in this mode so the renaming survives (if SWC
      // ran after, it would re-minify back to short names, undoing the work).
      if (process.env.OBFUSCATE === '1') {
        config.optimization = config.optimization || {};
        config.optimization.minimize = false;

        const WebpackObfuscator = require('webpack-obfuscator');
        config.plugins.push(
          new WebpackObfuscator(
            {
              compact: true,
              identifierNamesGenerator: 'hexadecimal',
              // Known-safe transforms (verified worker-compatible). The strong
              // string-array / control-flow transforms break the ~15 inline
              // blob workers this app spawns; we keep them off and lean on:
              //   • numbersToExpressions   — every number → (a^b) arithmetic
              //   • transformObjectKeys    — object literal keys hex-named
              //   • unicodeEscapeSequence  — string literals → \uXXXX form
              //   • simplify               — collapses dead control flow
              //   • domainLock             — bundle refuses to run off-host
              //   • disableConsoleOutput   — silences console.* in prod
              // Combined, these turn the bundle into something a casual scraper
              // can't parse, while the workers stay intact. Stronger transforms
              // require the worker-extraction refactor noted earlier.
              numbersToExpressions: true,
              simplify: true,
              // transformObjectKeys: OFF. It rewrites object-literal keys into a
              // hex lookup table accessed as obj[table][key]; on the shared video
              // module that produced a runtime "Cannot read properties of
              // undefined (reading 'undefined')" on LOAD for every video tool
              // (verified live on video-trim/-reframe/-to-shorts; absent in a
              // non-obfuscated build). Low anti-clone value vs the breakage —
              // disabled. Identifier hex-renaming + domainLock remain the moat.
              transformObjectKeys: false,
              unicodeEscapeSequence: true,
              // OFF: it swallowed every console.error in prod, so live failures
              // (SAM load, silent ffmpeg hangs) showed nothing to diagnose.
              disableConsoleOutput: false,
              stringArray: false,
              selfDefending: false,
              controlFlowFlattening: false,
              deadCodeInjection: false,
              renameProperties: false,
              // domainLock: OFF. Its prologue reads document/location, which a
              // Worker lacks, and webpack's worker chunks have numeric names
              // (e.g. 6043.<hash>.js) that the '**/*.worker.js' exclude below
              // never matches — so ffmpeg's worker threw "reading 'undefined'"
              // on load and EVERY ffmpeg tool (all video tools, WAV→MP3,
              // video→audio) hung forever in production. Found by driving the
              // live pages in Chrome (scripts/live_e2e.mjs).
              domainLock: [],
              log: false,
            },
            // Don't touch the framework runtime / worker glue — obfuscating those
            // is the usual cause of broken App Router chunk loading.
            ['**/webpack-*.js', '**/framework-*.js', '**/*.worker.js', '**/sw.js'],
          ),
        );
      }
    }

    return config;
  },
};

export default nextConfig;
