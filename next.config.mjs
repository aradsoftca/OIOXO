import { createRequire } from 'module';

// CommonJS deps loaded lazily inside the (ESM) config.
const require = createRequire(import.meta.url);

// Set NEXT_BASE_PATH=/xonvert at build time when deploying behind the subpath
// on Iceland (http://194.247.182.248/xonvert/). Leave empty for local dev.
const basePath = process.env.NEXT_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
    ];
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
        ],
      },
      ...wasmDirs.map((source) => ({ source, headers: immutable })),
      { source: '/pdf.worker.min.mjs', headers: immutable },
      { source: '/gif.worker.js', headers: immutable },
    ];
  },
  experimental: {
    webpackBuildWorker: true,
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
              // Known-good hex-only renaming. Stronger transforms are NOT worth
              // it here: splitStrings made builds ~15min at 482 pages, and the
              // numbers/simplify set destabilized the Next build (pages-manifest
              // ENOENT). The strong worker-breakers (stringArray/control-flow)
              // need a worker-extraction refactor + browser QA. The real moat is
              // the WASM brain-core, not JS obfuscation.
              numbersToExpressions: false,
              simplify: true,
              disableConsoleOutput: false,
              stringArray: false,
              selfDefending: false,
              controlFlowFlattening: false,
              deadCodeInjection: false,
              renameProperties: false,
              transformObjectKeys: false,
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
