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
    .invoke_handler(tauri::generate_handler![exec, write_files])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
