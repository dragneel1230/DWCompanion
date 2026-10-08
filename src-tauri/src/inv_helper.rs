// Inventory through warframe-api-helper (github.com/Sainan/warframe-api-helper): an outside open-source
// tool. After the player confirms the risk, the app downloads one pinned release (checked by SHA-256)
// into its own data folder. On the player's button press it runs that exe in an empty temp folder,
// hidden, waits for the inventory.json it writes, returns it and deletes the folder. The app itself
// never opens the game process or sees the session token. See docs/DESIGN.md §2E.

use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const TIMEOUT: Duration = Duration::from_secs(90);
// Pinned release: a new version means a new URL and hash here, after looking at its code.
const RELEASE_URL: &str = "https://github.com/Sainan/warframe-api-helper/releases/download/1.1.2/warframe-api-helper.exe";
const RELEASE_SHA256: &str = "549814f2a13f6f0754fdf25a8611ba05a897ce45b66802c641a9982ae99e28fc";
const EXE_NAME: &str = "warframe-api-helper.exe";

fn tools_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_local_data_dir().map(|d| d.join("tools")).map_err(|e| format!("rust.inv.failed|{e}"))
}

// The copy the app installed, if any.
#[tauri::command]
pub fn inv_helper_installed(app: AppHandle) -> Option<String> {
    let p = tools_dir(&app).ok()?.join(EXE_NAME);
    p.is_file().then(|| p.to_string_lossy().into_owned())
}

// Downloads the pinned release into the app's data folder; refuses a file with another hash.
#[tauri::command]
pub async fn inv_helper_install(app: AppHandle) -> Result<String, String> {
    use tauri_plugin_http::reqwest;
    let client = reqwest::Client::builder()
        .user_agent(concat!("DWCompanion/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("rust.inv.failed|{e}"))?;
    let res = client.get(RELEASE_URL).send().await.map_err(|_| "rust.inv.download".to_string())?;
    if !res.status().is_success() {
        return Err(format!("rust.inv.downloadHttp|{}", res.status().as_u16()));
    }
    let bytes = res.bytes().await.map_err(|_| "rust.inv.download".to_string())?;
    let hash: String = Sha256::digest(&bytes).iter().map(|b| format!("{b:02x}")).collect();
    if hash != RELEASE_SHA256 {
        return Err("rust.inv.badHash".into());
    }
    let dir = tools_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("rust.inv.failed|{e}"))?;
    let tmp = dir.join(format!("{EXE_NAME}.part"));
    let dst = dir.join(EXE_NAME);
    std::fs::write(&tmp, &bytes).map_err(|e| format!("rust.inv.failed|{e}"))?;
    std::fs::rename(&tmp, &dst).map_err(|e| format!("rust.inv.failed|{e}"))?;
    Ok(dst.to_string_lossy().into_owned())
}

// Removes the installed copy.
#[tauri::command]
pub fn inv_helper_remove(app: AppHandle) -> Result<(), String> {
    let p = tools_dir(&app)?.join(EXE_NAME);
    if p.is_file() {
        std::fs::remove_file(&p).map_err(|e| format!("rust.inv.failed|{e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn inv_helper_run(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || run(Path::new(&path)))
        .await
        .map_err(|e| format!("rust.inv.failed|{e}"))?
}

// Common places the player may have saved it: Downloads, Desktop, next to the app.
#[tauri::command]
pub fn inv_helper_find() -> Option<String> {
    let home = std::env::var_os("USERPROFILE").map(PathBuf::from);
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Some(h) = &home {
        dirs.push(h.join("Downloads"));
        dirs.push(h.join("Desktop"));
    }
    if let Some(d) = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf)) {
        dirs.push(d);
    }
    for d in dirs {
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            if is_helper(&p) && p.is_file() {
                return Some(p.to_string_lossy().into_owned());
            }
        }
    }
    None
}

// Only this tool: the app runs nothing else (the page passes a path the player chose).
fn is_helper(p: &Path) -> bool {
    let name = p.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    name.starts_with("warframe-api-helper") && name.ends_with(".exe")
}

fn run(exe: &Path) -> Result<String, String> {
    if !is_helper(exe) {
        return Err("rust.inv.notHelper".into());
    }
    if !exe.is_file() {
        return Err("rust.inv.noExe".into());
    }
    let dir = std::env::temp_dir().join(format!("dwc-inv-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).map_err(|e| format!("rust.inv.failed|{e}"))?;
    let out = run_in(exe, &dir);
    let _ = std::fs::remove_dir_all(&dir);
    out
}

fn run_in(exe: &Path, dir: &Path) -> Result<String, String> {
    // stdin from nul: the tool ends with "pause", which then returns at once instead of waiting.
    let mut child = Command::new(exe)
        .current_dir(dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("rust.inv.failed|{e}"))?;
    let start = Instant::now();
    let status = loop {
        if let Some(s) = child.try_wait().map_err(|e| format!("rust.inv.failed|{e}"))? {
            break s;
        }
        if start.elapsed() > TIMEOUT {
            let _ = child.kill();
            return Err("rust.inv.timeout".into());
        }
        std::thread::sleep(Duration::from_millis(200));
    };
    // Exit codes of warframe-api-helper main.cpp.
    match status.code() {
        Some(0) => {}
        Some(1) => return Err("rust.inv.noGame".into()),
        Some(2) => return Err("rust.inv.noAccess".into()),
        Some(3) => return Err("rust.inv.noSession".into()),
        Some(5) => return Err("rust.inv.request".into()),
        Some(6) => return Err("rust.inv.badAnswer".into()),
        c => return Err(format!("rust.inv.failed|{}", c.map(|c| c.to_string()).unwrap_or_default())),
    }
    std::fs::read_to_string(dir.join("inventory.json")).map_err(|_| "rust.inv.noFile".to_string())
}

// Every new EE.log line (bench.rs). The game asks DE for the inventory itself when the player gets back
// to the ship ("Bad data from inventory.php" follows that request; the ship level is the fallback when it
// doesn't): the app's "refresh after a mission" waits for this, so the tool runs right after the game's own sync.
pub fn on_line(app: &AppHandle, line: &str) {
    if line.contains("from inventory.php") || line.contains("ServerFramework:OpenLevel - /Lotus/Levels/Proc/PlayerShip") {
        let _ = tauri::Emitter::emit(app, "game-inventory-sync", ());
    }
}
