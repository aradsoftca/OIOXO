//! Xonvert AI — brain core in Rust → WASM.
//!
//! The point: the cleverest, most-copyable logic (type system, decision rules)
//! ships as WASM bytecode instead of readable JS. This POC ports `mimeFamily`
//! from capability-graph.ts to prove the pipeline; the rest of the deterministic
//! core (goal inference, guardrail, chain validation, retrieval) follows behind
//! the same boundary.

use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
struct Cand {
    id: String,
    #[serde(default)]
    accepts: Vec<String>,
    #[serde(default)]
    produces: Vec<String>,
}

// Multi-step phrasing (port of decide.ts MULTI_STEP) — done by word tokens to
// avoid pulling the heavy regex crate into the WASM. Equivalent for real input.
fn is_multi_step(message: &str) -> bool {
    let lower = message.to_lowercase();
    let toks: Vec<&str> = lower
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| !s.is_empty())
        .collect();
    const VERBS: [&str; 17] = [
        "translate", "convert", "add", "compress", "resize", "rotate", "crop", "merge",
        "watermark", "make", "summarize", "summarise", "extract", "remove", "split", "blur",
        "sharpen",
    ];
    for i in 0..toks.len() {
        let t = toks[i];
        if t == "then" {
            return true; // covers "and then" too
        }
        if t == "after" && toks.get(i + 1) == Some(&"that") {
            return true;
        }
        if t == "and" {
            let mut j = i + 1;
            if toks.get(j) == Some(&"also") {
                j += 1;
            }
            if let Some(next) = toks.get(j) {
                if VERBS.contains(next) {
                    return true;
                }
            }
        }
    }
    false
}

/// Does a proposed chain TYPE-CONNECT? (port of decide.ts chainConnects). Each
/// step's produced family must feed the next's accepted family; unknown/empty
/// types get the benefit of the doubt (only a KNOWN mismatch fails).
fn connects(tools: &[String], cands: &[Cand]) -> bool {
    let find = |id: &str| cands.iter().find(|c| c.id == id);
    for i in 0..tools.len().saturating_sub(1) {
        if let (Some(a), Some(b)) = (find(&tools[i]), find(&tools[i + 1])) {
            if !a.produces.is_empty()
                && !b.accepts.is_empty()
                && !a.produces.iter().any(|p| b.accepts.contains(p))
            {
                return false;
            }
        }
    }
    true
}

#[wasm_bindgen]
pub fn chain_connects(tools_json: &str, cands_json: &str) -> bool {
    let tools: Vec<String> = serde_json::from_str(tools_json).unwrap_or_default();
    let cands: Vec<Cand> = serde_json::from_str(cands_json).unwrap_or_default();
    connects(&tools, &cands)
}

/// Parse + validate a model decision reply (port of decide.ts parseDecision).
/// Returns the Decision as a JSON string, or "" for null (unusable).
#[wasm_bindgen]
pub fn parse_decision(raw: &str, cands_json: &str) -> String {
    use serde_json::{json, Value};
    if raw.is_empty() {
        return String::new();
    }
    let cands: Vec<Cand> = serde_json::from_str(cands_json).unwrap_or_default();
    // Extract the first {...last} like the TS regex, else try the raw string.
    let slice = match (raw.find('{'), raw.rfind('}')) {
        (Some(s), Some(e)) if e >= s => &raw[s..=e],
        _ => raw,
    };
    let obj: Value = match serde_json::from_str(slice) {
        Ok(v) => v,
        Err(_) => return String::new(),
    };
    let action = obj.get("action").and_then(|a| a.as_str()).unwrap_or("");
    if !matches!(action, "tool" | "chain" | "answer" | "chat" | "offer") {
        return String::new();
    }
    let ids: std::collections::HashSet<&str> = cands.iter().map(|c| c.id.as_str()).collect();
    let tools: Vec<String> = obj
        .get("tools")
        .and_then(|t| t.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .filter(|s| ids.contains(s))
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default();

    if action == "tool" || action == "chain" {
        if tools.is_empty() {
            return String::new();
        }
        if tools.len() > 1 {
            if !connects(&tools, &cands) {
                return json!({"action":"offer","tools":[]}).to_string();
            }
            return json!({"action":"chain","tools":tools}).to_string();
        }
        return json!({"action":"tool","tools":tools}).to_string();
    }
    if action == "answer" {
        let q = obj.get("query").and_then(|v| v.as_str()).map(|s| s.trim()).filter(|s| !s.is_empty());
        let mut out = json!({"action":"answer","tools":[]});
        if let Some(q) = q {
            out["query"] = json!(q);
        }
        return out.to_string();
    }
    // chat / offer — keep a clean reply, drop a tool-id dump.
    let r = obj.get("reply").and_then(|v| v.as_str()).map(|s| s.trim()).unwrap_or("");
    let id_hits = cands.iter().filter(|c| r.contains(c.id.as_str())).count();
    let junk = r.is_empty()
        || r.chars().count() > 320
        || r.contains('\u{2192}') // →
        || r.contains("->")
        || r.contains("::=")
        || id_hits >= 2;
    let mut out = json!({ "action": action, "tools": [] });
    if !junk {
        out["reply"] = json!(r);
    }
    out.to_string()
}

/// The guardrail (port of decide.ts guardrailTool): when retrieval is confident,
/// single-step, and the top tool POSITIVELY accepts the input family, return its
/// id to force; else "" (let the model decide).
#[wasm_bindgen]
pub fn guardrail_tool(message: &str, cands_json: &str, input_fam: &str, conf: &str) -> String {
    if conf != "confident" {
        return String::new();
    }
    let cands: Vec<Cand> = serde_json::from_str(cands_json).unwrap_or_default();
    if cands.is_empty() {
        return String::new();
    }
    if is_multi_step(message) {
        return String::new();
    }
    let top = &cands[0];
    if !input_fam.is_empty() && !top.accepts.iter().any(|a| a == input_fam) {
        return String::new();
    }
    top.id.clone()
}

fn has_any(m: &str, parts: &[&str]) -> bool {
    parts.iter().any(|p| m.contains(p))
}

fn is_3d_ext(m: &str) -> bool {
    const EXT: [&str; 16] = [
        ".obj", ".stl", ".fbx", ".dae", ".ply", ".3ds", ".gltf", ".glb", ".3mf",
        ".step", ".stp", ".iges", ".igs", ".brep", ".dwg", ".dxf",
    ];
    EXT.iter().any(|e| m.ends_with(e))
}

fn ends_any(m: &str, exts: &[&str]) -> bool {
    exts.iter().any(|e| m.ends_with(e))
}

/// Map a MIME type or file extension to a coarse media family. 1:1 port of
/// capability-graph.ts `mimeFamily` (returns "" for unknown, like null).
#[wasm_bindgen]
pub fn mime_family(raw: &str) -> String {
    let m = raw.to_lowercase();
    let m = m.trim();
    let fam = if m.starts_with("image/") {
        "image"
    } else if m.starts_with("audio/") {
        "audio"
    } else if m.starts_with("video/") {
        "video"
    } else if m.starts_with("font/") {
        "font"
    } else if m.starts_with("model/") || is_3d_ext(m) {
        "3d"
    } else if m == "application/pdf" || m == ".pdf" {
        "pdf"
    } else if has_any(m, &["zip", "x-7z", "rar", "x-tar", "gzip", "x-bzip2"]) {
        "archive"
    } else if has_any(m, &["epub", "mobi", "azw"]) {
        "ebook"
    } else if has_any(m, &["spreadsheet", "ms-excel"]) || ends_any(m, &[".xlsx", ".xls", ".ods"]) {
        "sheet"
    } else if has_any(m, &["presentation", "powerpoint"]) || ends_any(m, &[".pptx", ".ppt", ".odp"]) {
        "slides"
    } else if has_any(m, &["word", "msword", "wordprocessing"]) || ends_any(m, &[".docx", ".doc", ".odt", ".rtf"]) {
        "doc"
    } else if m.contains("opendocument") {
        "doc"
    } else if m.starts_with("text/") || has_any(m, &["json", "xml", "csv", "yaml", "x-subrip", "vtt"]) {
        "text"
    } else if m.starts_with("application/") {
        "data"
    } else {
        ""
    };
    fam.to_string()
}

// FORMAT_ALIASES — MIME subtype → canonical short format word.
fn format_alias(key: &str) -> Option<&'static str> {
    Some(match key {
        "mpeg" => "mp3", "x-wav" => "wav", "x-m4a" => "m4a", "svg+xml" => "svg",
        "quicktime" => "mov", "x-matroska" => "mkv", "x-msvideo" => "avi",
        "epub+zip" => "epub", "jpeg" => "jpg", "x-7z-compressed" => "7z",
        "vnd.rar" => "rar", "gzip" => "gz", "x-bzip2" => "bz2", "x-tar" => "tar",
        "vnd.openxmlformats-officedocument.spreadsheetml.sheet" => "xlsx",
        "vnd.openxmlformats-officedocument.wordprocessingml.document" => "docx",
        "vnd.openxmlformats-officedocument.presentationml.presentation" => "pptx",
        "gltf-binary" => "glb", "gltf+json" => "gltf",
        _ => return None,
    })
}

/// Short format word for a MIME / extension (port of capability-graph.ts mimeFormat).
#[wasm_bindgen]
pub fn mime_format(raw: &str) -> String {
    let lower = raw.to_lowercase();
    let m = lower.trim();
    if let Some(rest) = m.strip_prefix('.') {
        return rest.to_string();
    }
    let slash = match m.find('/') {
        Some(i) => i,
        None => return String::new(),
    };
    let after = &m[slash + 1..];
    if after == "*" {
        return String::new();
    }
    let sub = after.strip_prefix("x-").unwrap_or(after);
    if let Some(a) = format_alias(after) {
        return a.to_string();
    }
    if let Some(a) = format_alias(sub) {
        return a.to_string();
    }
    sub.to_string()
}

// WORD_FAMILY — a user word/format → media family.
fn word_family_of(w: &str) -> &'static str {
    match w {
        "image" | "picture" | "photo" | "pic" | "img" | "png" | "jpg" | "jpeg" | "webp"
        | "avif" | "gif" | "bmp" | "tiff" | "svg" | "ico" | "heic" => "image",
        "audio" | "sound" | "music" | "song" | "mp3" | "wav" | "flac" | "ogg" | "aac" | "m4a" => "audio",
        "video" | "movie" | "clip" | "mp4" | "mov" | "webm" | "mkv" | "avi" => "video",
        "pdf" => "pdf",
        "text" | "txt" | "csv" | "json" | "html" | "md" => "text",
        "doc" | "document" | "word" | "docx" | "odt" | "rtf" => "doc",
        "spreadsheet" | "excel" | "sheet" | "xlsx" | "ods" => "sheet",
        "powerpoint" | "slides" | "presentation" | "deck" | "pptx" | "odp" => "slides",
        "ebook" | "epub" | "mobi" => "ebook",
        "archive" | "zip" => "archive",
        "font" | "ttf" | "otf" | "woff" => "font",
        "3d" | "model" | "stl" | "obj" | "glb" | "gltf" => "3d",
        "data" => "data",
        _ => "",
    }
}

/// A user word/format → media family, "" if unknown (port of wordFamily).
#[wasm_bindgen]
pub fn word_family(word: &str) -> String {
    let lower = word.to_lowercase();
    word_family_of(lower.trim()).to_string()
}

/// A concrete format word, or "" if it's a bare family name (port of wordToFormat).
#[wasm_bindgen]
pub fn word_to_format(word: &str) -> String {
    let lower = word.to_lowercase();
    let w = lower.trim();
    const FAMILY_WORDS: [&str; 21] = [
        "image", "picture", "photo", "audio", "sound", "music", "video", "movie", "text",
        "doc", "document", "sheet", "spreadsheet", "slides", "presentation", "ebook",
        "archive", "font", "data", "3d", "model",
    ];
    if FAMILY_WORDS.contains(&w) {
        return String::new();
    }
    if word_family_of(w).is_empty() {
        return String::new();
    }
    if w == "jpeg" {
        return "jpg".to_string();
    }
    w.to_string()
}

/// Tiny self-test export so the JS side can confirm the module loaded + runs.
#[wasm_bindgen]
pub fn brain_core_version() -> String {
    "brain-core 0.2.0".to_string()
}
