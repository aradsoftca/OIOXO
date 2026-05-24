use std::process::Command;

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
    .invoke_handler(tauri::generate_handler![exec])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
