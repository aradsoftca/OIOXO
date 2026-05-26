# OIOXO Native Mesh — one Tauri app, five platforms

Wrap the existing oioxo.com web app in a native shell so any device — Windows, macOS,
Linux, Android, iOS — can join the compute mesh as a **reliable** helper, using its real
hardware. The web build (OIOXO_COMPUTE_MESH.md) already does consumer + foreground
desktop-provider in any browser; native removes the four browser walls that stop a
device being an *always-on, full-power* provider.

## Why one app, not five

Tauri v2 builds all five targets from a single project: a system **webview** runs the
existing React + mesh TypeScript unchanged, and a thin **Rust** core adds the native
capabilities. We write the platform-specific bits once in Rust; the UI and all mesh
logic are the code already shipped.

The codebase was built for this — the seams already exist:

- `lib/oioxo/remote-coder.ts` `makeHttpCoder` — a provider over plain HTTP. A native app
  opens a real LAN socket and plugs straight in.
- `lib/oioxo/codebuild.ts` `BuildOptions.generate` / `.run` — inject a native engine in
  place of the webview one (no loop change).
- `lib/oioxo/tier.ts` / `native.ts` — the `native` execution tier already anticipates a
  desktop app with real process exec.
- `lib/oioxo/usage-client.ts` — already documents a desktop path (bearer token from the
  OS keychain) for the same meter.

## Architecture: wrap, don't fork

```
┌──────────────────────────── Tauri app (one per device) ─────────────────────────┐
│  System WebView                                  Rust core (src-tauri)            │
│  ┌───────────────────────────┐                   ┌────────────────────────────┐  │
│  │ oioxo.com web app (React)  │  window.__TAURI__ │ commands (invoke):         │  │
│  │  + the mesh TS (unchanged) │◀── core.invoke ──▶│  mesh_generate (native LLM)│  │
│  │  native-bridge.ts detects  │                   │  mesh_run      (real exec) │  │
│  │  Tauri → injects native    │                   │  lan_serve_*   (HTTP node) │  │
│  │  generate/run/keychain     │                   │  mdns_*        (discovery) │  │
│  └───────────────────────────┘                   │  keychain_*    (device key)│  │
│         the page is loaded from https://oioxo.com │  tray / background         │  │
└───────────────────────────────────────────────────┴────────────────────────────┘
```

The webview **loads the live oioxo.com** (so NextAuth, Prisma, `/api/*`, the meter all
keep working server-side — no static export, no duplicated backend). `native-bridge.ts`
checks `window.__TAURI__`; when present it wires the Rust commands into the existing mesh
seams. On the web (no Tauri) every native call is a no-op and the browser paths run — so
**one frontend serves both**.

### What each Rust command does

| Command | Purpose | Crate |
|---|---|---|
| `mesh_generate(ctx)` | Run the coder model natively (Metal/CUDA/Vulkan/NPU) → `Edit[]` | llama.cpp (llama-cpp-2) / MLC |
| `mesh_run(files, cmd)` | Real process exec oracle (npm test, build) | std::process |
| `lan_serve_start(port)` | Expose `/generate` + `/verify` over the LAN ("API device") | axum / tiny_http |
| `mdns_advertise / discover` | Auto-find sibling devices on the Wi-Fi (no QR) | mdns-sd |
| `keychain_get / set` | Store the device private key in the OS keychain (non-exportable) | keyring |
| tray / background | Keep lending while the window is closed / screen off | tauri tray + plugins |

### How native plugs into the mesh

- **Provider (lend):** `lan_serve_start` opens an HTTP endpoint; a sibling consumer uses
  the existing `makeHttpCoder(url)` against it. mDNS replaces the QR for discovery.
  `mesh_generate` does the actual model run with full GPU access.
- **Consumer (use):** unchanged — it already borrows via the pools; on native it can also
  discover providers by mDNS instead of pasting a code.
- **Receipts / credit:** unchanged — same signed `WorkReceipt` flow; the device key now
  lives in the OS keychain (`keychain_*`) instead of IndexedDB.

## Per-platform reality (honest)

| Platform | Provider | Inference | Background | Notes |
|---|---|---|---|---|
| Windows | ✅ full | CUDA/DirectML/Vulkan or webview WebGPU | tray service | best provider |
| macOS | ✅ full | Metal | tray (login item) | best provider |
| Linux | ✅ full | CUDA/Vulkan | tray/systemd user unit | best provider |
| Android | ✅ good | Vulkan native or webview WebGPU | foreground service | thermal/battery aware |
| iOS | ⚠️ partial | **native only** (MLC/llama.cpp Metal); webview can't | **Apple-limited** — lends while active, brief background windows only | great consumer; not a 24/7 node |

The iPhone is a first-class **consumer** everywhere and a "lend while I'm using it"
provider — Apple does not permit arbitrary 24/7 background compute. **Desktops are the
always-on providers.**

## Build / ship matrix (CI — can't be done on one machine)

`.github/workflows/tauri-build.yml`:

- **Desktop** — `tauri-apps/tauri-action` on `windows-latest`, `macos-latest`,
  `ubuntu-latest` → `.msi` / `.app`+`.dmg` / `.AppImage`+`.deb`. macOS needs Apple
  signing + notarization; Windows an Authenticode cert.
- **Android** — `ubuntu-latest` + Android SDK/NDK → `tauri android build` → `.apk`/`.aab`
  (Play Store). Needs a signing keystore.
- **iOS** — `macos-latest` + Xcode → `tauri ios build` → `.ipa` (App Store / TestFlight).
  Needs an Apple Developer account + provisioning. The native-inference bridge (MLC) is
  the extra iOS work.

## Phasing

1. ✅ **Web** (done, live on oioxo.com) — consumer + foreground desktop provider.
2. **Desktop Tauri** (Win/Mac/Linux) — always-on provider + LAN endpoint + mDNS +
   keychain key. webview WebGPU first; native llama.cpp engine second. ← build first
3. **Android Tauri** — same shell + foreground service; native Vulkan engine.
4. **iOS Tauri** — MLC/llama.cpp Metal bridge; ship within Apple's background limits.

## Scaffold in this repo (this branch)

A Tauri v2 shell already existed (`src-tauri/`: config loads oioxo.com, `withGlobalTauri`
on, `exec` + `write_files` commands, capabilities already grant oioxo.com remote IPC).
This branch EXTENDS it:

- `src-tauri/src/lib.rs` — added `mesh_generate`, `lan_serve_start/stop`, `mdns_discover`,
  `keychain_get/set` (stubs with the integration point marked; no new crates, so the
  existing build stays valid) and registered them. The native verify oracle reuses the
  proven `exec` + `write_files`.
- `lib/oioxo/native-bridge.ts` — web-safe detector + injector (typechecks; no-ops on the
  web): `nativeGenerate`/`nativeRun`/`startLanProvider`/`discoverSiblings`/`keychain*`,
  and `nativeLendEngines()` for MeshPanel's lend props.
- `app/oioxo/CodeAgent.tsx` — the lend engines now prefer native (`nativeLendEngines()`)
  with the webview coder/type-oracle as fallback. Web build unchanged.
- `.github/workflows/tauri-build.yml` — desktop build matrix (mac/linux/windows via
  tauri-action); Android/iOS jobs documented (need signing secrets + `tauri {android,ios}
  init`).

NOT done here (needs a toolchain / per-OS machine / CI): `cargo build`, code signing,
store submission, mDNS + LAN-server impl, OS-keychain impl, and the native llama.cpp/MLC
inference (`mesh_generate`) — the largest remaining sub-project. Until those land, the
desktop app already works via the **webview** (WebView2/WebKit WebGPU runs the coder), so
shipping Phase 2 doesn't block on native inference.
