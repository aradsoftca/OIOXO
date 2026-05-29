use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Deserialize;

/// Run a shell command on the real machine and return its exit code + output.
/// This is the native superpower the browser can't do — the coding agent uses
/// it (via the JS bridge in lib/oioxo/native.ts) when running in the desktop app.
#[tauri::command]
fn exec(command: String, cwd: Option<String>) -> Result<serde_json::Value, String> {
  let (shell, flag) = if cfg!(windows) { ("cmd", "/C") } else { ("sh", "-c") };
  let mut c = Command::new(shell);
  c.arg(flag).arg(&command);
  if let Some(dir) = cwd {
    c.current_dir(dir);
  }
  let out = c.output().map_err(|e| e.to_string())?;
  Ok(serde_json::json!({
    "code": out.status.code().unwrap_or(-1),
    "stdout": String::from_utf8_lossy(&out.stdout),
    "stderr": String::from_utf8_lossy(&out.stderr),
  }))
}

#[derive(Deserialize)]
struct FileSpec {
  path: String,
  content: String,
}

/// Materialize the coding-agent's project onto the real filesystem so the native
/// runner can execute the genuine test command against it. Writes into `dir`
/// (or a temp workspace), creating parent directories. Refuses paths that escape
/// the workspace (no absolute paths, no `..`). Returns the workspace dir.
#[tauri::command]
fn write_files(files: Vec<FileSpec>, dir: Option<String>) -> Result<String, String> {
  let base: PathBuf = match dir {
    Some(d) => PathBuf::from(d),
    None => std::env::temp_dir().join("oioxo-workspace"),
  };
  fs::create_dir_all(&base).map_err(|e| e.to_string())?;
  for f in files {
    let rel = Path::new(&f.path);
    if rel.is_absolute() || rel.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
      return Err(format!("unsafe path: {}", f.path));
    }
    let full = base.join(rel);
    if let Some(parent) = full.parent() {
      fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&full, f.content).map_err(|e| e.to_string())?;
  }
  Ok(base.to_string_lossy().to_string())
}

/// Fetch ANY url directly from the user's machine — the native superpower that
/// makes a real on-device web reader possible. The browser can't read an arbitrary
/// cross-origin page (CORS); native code has no such limit, so this is exactly like
/// curl / the address bar: no proxy, no key, no third-party index, no rate cap.
/// Used by the AI engine (via lib/oioxo/native.ts → lib/ai/fetch-page.ts) to run
/// the "search → open the top 10 results → read them → answer" loop entirely on the
/// device. Follows redirects, decompresses, returns the final url + status + body.
#[tauri::command]
async fn http_get(
  url: String,
  headers: Option<std::collections::HashMap<String, String>>,
) -> Result<serde_json::Value, String> {
  let client = reqwest::Client::builder()
    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
    .timeout(std::time::Duration::from_secs(20))
    .build()
    .map_err(|e| e.to_string())?;
  let mut req = client.get(&url);
  if let Some(h) = headers {
    for (k, v) in h {
      req = req.header(k, v);
    }
  }
  let resp = req.send().await.map_err(|e| e.to_string())?;
  let status = resp.status().as_u16();
  let final_url = resp.url().to_string();
  let body = resp.text().await.unwrap_or_default();
  Ok(serde_json::json!({ "status": status, "url": final_url, "body": body }))
}

// ─────────────────────────── COMPUTE MESH (native) ───────────────────────────
// The mesh's native superpowers (OIOXO_NATIVE_MESH.md). Reached from the web app via
// lib/oioxo/native-bridge.ts. The verify oracle reuses exec + write_files above; the
// commands below are the NEW native-only capabilities. They are stubs with the exact
// integration point marked — implementing them is the per-platform native work; until
// then the JS bridge no-ops gracefully (the mesh falls back to the webview paths).

/// Run the coder model NATIVELY (Metal/CUDA/Vulkan/NPU) and return file edits.
/// TODO(native-inference): bind llama.cpp (llama-cpp-2 crate) / MLC and decode the
/// model named by the installed `code` skill. Until then the webview WebGPU coder
/// handles generation, so returning an error here is safe (bridge → []).
#[tauri::command]
fn mesh_generate(_ctx: serde_json::Value) -> Result<serde_json::Value, String> {
  Err("native inference not built yet — see OIOXO_NATIVE_MESH.md (webview coder is used meanwhile)".into())
}

/// Start a LAN HTTP provider ("API device") exposing /generate + /verify to siblings.
/// TODO(lan): serve with axum/tiny_http bound to 0.0.0.0:<port>, dispatch /generate to
/// mesh_generate and /verify to exec+write_files; return the chosen URL.
#[tauri::command]
fn lan_serve_start(_port: u16) -> Result<String, String> {
  Err("LAN provider not implemented yet — see OIOXO_NATIVE_MESH.md".into())
}

#[tauri::command]
fn lan_serve_stop() -> Result<(), String> {
  Ok(())
}

/// Discover sibling provider endpoints on the local network (replaces the QR).
/// TODO(mdns): advertise + browse `_oioxo-mesh._tcp` via the mdns-sd crate. Empty list
/// is the safe default (the UI still offers manual QR/paste pairing).
#[tauri::command]
fn mdns_discover() -> Result<Vec<serde_json::Value>, String> {
  Ok(vec![])
}

/// Read the device's private signing key from the OS keychain (non-exportable store).
/// TODO(keychain): back with the `keyring` crate. Returning None makes the bridge fall
/// back to IndexedDB storage, so receipts still work.
#[tauri::command]
fn keychain_get(_account: String) -> Result<Option<String>, String> {
  Ok(None)
}

#[tauri::command]
fn keychain_set(_account: String, _value: String) -> Result<(), String> {
  Err("OS keychain not wired yet — IndexedDB used meanwhile (see OIOXO_NATIVE_MESH.md)".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      exec,
      write_files,
      mesh_generate,
      lan_serve_start,
      lan_serve_stop,
      mdns_discover,
      keychain_get,
      keychain_set
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
