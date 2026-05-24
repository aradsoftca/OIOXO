# oioxo desktop (Tauri v2)

A native desktop shell that loads oioxo.com and adds the **native superpower the
browser can't do**: running real shell commands on the machine (`exec` command),
wired to the coding agent via `lib/oioxo/native.ts`.

## What's here
- `tauri.conf.json` — window loads `https://oioxo.com/`, `withGlobalTauri` on.
- `src/lib.rs` — the `exec` command (runs a shell command, returns code/stdout/stderr).
- `capabilities/default.json` — allows the oioxo.com origin to use IPC.

## Prerequisites (build machine)
- **Rust (MSVC toolchain)** — `rustup default stable-x86_64-pc-windows-msvc`
  (Tauri on Windows needs MSVC, not GNU).
- **Visual Studio Build Tools** (Desktop C++ workload) — for the MSVC linker.
- **WebView2 runtime** — preinstalled on Windows 11.
- Tauri CLI: `npx --yes @tauri-apps/cli@latest`.

## Run / build (from `newxonvert/`)
```bash
# dev (opens a window loading oioxo.com, hot IPC):
npx --yes @tauri-apps/cli@latest dev

# production installer (.msi/.exe via NSIS) -> src-tauri/target/release/bundle/:
npx --yes @tauri-apps/cli@latest build
```

## Native execution
Inside the desktop app, `window.__TAURI__` exists, so `lib/oioxo/native.ts`
`execNative(cmd, cwd)` invokes the Rust `exec`. In the PWA it's absent and the
coding agent falls back to the in-browser WebContainer. To run a bigger local
coding model with full GPU, add a model-runtime command in `src/lib.rs` later
(llama.cpp / candle) — same invoke pattern.

## Other platforms
- **Android:** `npx tauri android init` then `... android build` (needs Android
  SDK/NDK + Java).
- **macOS / iOS:** must be built on a Mac (Xcode) or a macOS CI runner — can't
  cross-build from Windows. iOS also needs an Apple Developer account.

> Note: this scaffold is wired but not yet built/verified on a toolchain — run
> the commands above on a machine with the MSVC Rust toolchain to produce the app.
