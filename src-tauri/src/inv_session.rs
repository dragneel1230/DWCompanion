// Inventory straight from DE, by the method of warframe-api-helper (github.com/Sainan/warframe-api-helper,
// 1.1.2 main.cpp, which uses the soup library). The player's decision of 2026-10-06, at their own risk,
// after the warning (docs/DESIGN.md §2E). The point over the external tool: read the game's memory ONCE per
// launch instead of on every refresh, so the game process is touched as little as possible.
//   1. Once per game launch: open Warframe.x64.exe FOR READING ONLY and find "?accountId=<24>&nonce=<digits>"
//      in its committed memory (the game keeps its own API request URLs there). No writing, no injection,
//      no threads, no input — only VirtualQueryEx + ReadProcessMemory.
//   2. The pair is cached in Windows Credential Manager together with the game's process id. Later refreshes
//      of the same launch only send GET mobile.warframe.com/api/inventory.php?accountId=…&nonce= — the game
//      process is not opened at all.
//   3. A new launch (different pid) or a rejected pair (re-login) reads memory once more. Never on a timer:
//      only the player's button or "refresh after a mission".
// The pair never reaches the page code; the page receives the inventory JSON only.
//
// Read-only note: soup's Process::open requests PROCESS_VM_WRITE | PROCESS_VM_OPERATION | PROCESS_CREATE_THREAD
// as well, though it only reads. We deliberately open with the minimal read subset
// (PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION): a strictly narrower handle than the reference tool's.

use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::Diagnostics::Debug::ReadProcessMemory;
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Memory::{VirtualQueryEx, MEMORY_BASIC_INFORMATION, MEM_COMMIT};
use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_VM_READ};

const GAME_EXE: &str = "Warframe.x64.exe";
const CRED_TARGET: &str = "DWCompanion/warframe-session";
const API: &str = "https://mobile.warframe.com/api/inventory.php";
const NEEDLE: &[u8] = b"?accountId="; // 11 bytes
const ACCOUNT_LEN: usize = 24;
const AMP_NONCE: usize = 7; // "&nonce="
// Same pair seen this many times is taken (the reference tool's rule): identical garbage rarely repeats 3×.
const SURE: u32 = 3;

struct Session {
    pid: u32,
    authz: String, // "?accountId=…&nonce=…"
}

fn load_session() -> Option<Session> {
    let s = crate::cred::read(CRED_TARGET)?;
    let (pid, authz) = s.split_once('|')?;
    Some(Session { pid: pid.parse().ok()?, authz: authz.to_string() })
}

fn save_session(s: &Session) {
    crate::cred::write(CRED_TARGET, &format!("{}|{}", s.pid, s.authz));
}

pub fn clear_session() {
    crate::cred::delete(CRED_TARGET);
}

// The running game's process id, from the system process list. The game process itself is NOT opened here.
fn game_pid() -> Option<u32> {
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
        let mut e = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut pid = None;
        let mut ok = Process32FirstW(snap, &mut e).is_ok();
        while ok {
            let len = e.szExeFile.iter().position(|&c| c == 0).unwrap_or(e.szExeFile.len());
            if String::from_utf16_lossy(&e.szExeFile[..len]).eq_ignore_ascii_case(GAME_EXE) {
                pid = Some(e.th32ProcessID);
                break;
            }
            ok = Process32NextW(snap, &mut e).is_ok();
        }
        let _ = CloseHandle(snap);
        pid
    }
}

struct ProcHandle(HANDLE);
impl Drop for ProcHandle {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

// Parse "?accountId=<24>&nonce=<digits>" at a position where NEEDLE was found; None if the bytes run out
// or the pair is malformed. Mirrors main.cpp gruzzleAuthz: 24 account bytes, skip "&nonce=", take digits.
fn authz_at(buf: &[u8], at: usize) -> Option<String> {
    let acc_start = at + NEEDLE.len();
    let acc_end = acc_start + ACCOUNT_LEN;
    let nonce_start = acc_end + AMP_NONCE;
    if nonce_start > buf.len() {
        return None;
    }
    let account = &buf[acc_start..acc_end];
    if !account.iter().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let mut nonce = Vec::new();
    for &b in &buf[nonce_start..] {
        if b.is_ascii_digit() {
            nonce.push(b);
        } else {
            break;
        }
    }
    if nonce.is_empty() {
        return None;
    }
    let mut s = String::from("?accountId=");
    s.push_str(std::str::from_utf8(account).ok()?);
    s.push_str("&nonce=");
    s.push_str(std::str::from_utf8(&nonce).ok()?);
    Some(s)
}

// One read-only pass over the game's committed memory for the session pair.
fn scan(pid: u32) -> Result<String, String> {
    let handle = unsafe { OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }
        .map_err(|_| "rust.inv.noAccess".to_string())?;
    let handle = ProcHandle(handle);

    let mut counts: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    let mut addr: usize = 0;
    let mut mbi = MEMORY_BASIC_INFORMATION::default();
    let size = std::mem::size_of::<MEMORY_BASIC_INFORMATION>();
    let mut buf: Vec<u8> = Vec::new();

    while unsafe { VirtualQueryEx(handle.0, Some(addr as *const _), &mut mbi, size) } == size {
        let region = mbi.RegionSize;
        let base = mbi.BaseAddress as usize;
        if mbi.State == MEM_COMMIT && region > 0 {
            if buf.len() < region {
                buf.resize(region, 0);
            }
            let mut read: usize = 0;
            // Whatever is readable (guard / no-access pages fail silently), like soup's externalScan.
            let ok = unsafe {
                ReadProcessMemory(handle.0, mbi.BaseAddress as *const _, buf.as_mut_ptr() as *mut _, region, Some(&mut read))
            }
            .is_ok();
            if ok && read >= NEEDLE.len() {
                let data = &buf[..read];
                let mut from = 0;
                while let Some(off) = find(&data[from..], NEEDLE) {
                    let at = from + off;
                    if let Some(authz) = authz_at(data, at) {
                        let c = counts.entry(authz.clone()).or_insert(0);
                        *c += 1;
                        if *c >= SURE {
                            return Ok(authz);
                        }
                    }
                    from = at + NEEDLE.len();
                }
            }
        }
        addr = base.saturating_add(region);
        if addr == base {
            break; // no progress: avoid an endless loop
        }
    }

    // Nothing reached the sure count: take the most frequent candidate, else fail.
    counts.into_iter().max_by_key(|(_, n)| *n).map(|(a, _)| a).ok_or_else(|| "rust.inv.noSession".to_string())
}

fn find(hay: &[u8], needle: &[u8]) -> Option<usize> {
    hay.windows(needle.len()).position(|w| w == needle)
}

// A reply that looks like an inventory (has the Suits array), to tell a good pair from a rejected one.
fn looks_like_inventory(body: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(body).ok().and_then(|v| v.get("Suits").map(|s| s.is_array())).unwrap_or(false)
}

async fn request(authz: &str) -> Result<String, String> {
    use tauri_plugin_http::reqwest;
    // Same request as warframe-api-helper: GET https://mobile.warframe.com/api/inventory.php?accountId=…&nonce= .
    // We also send the same User-Agent soup uses, so DE sees the same client signature. Accept-Encoding /
    // Connection are left to reqwest (forcing "deflate, gzip" would hand back a compressed body it can't decode).
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; calamity-inc/Soup)")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("rust.inv.failed|{e}"))?;
    let res = client.get(format!("{API}{authz}")).send().await.map_err(|_| "rust.inv.request".to_string())?;
    if !res.status().is_success() {
        return Err("rust.inv.badAnswer".into());
    }
    res.text().await.map_err(|_| "rust.inv.request".to_string())
}

// Reads the cached pair (same launch) or scans the game once, fetches inventory.php, returns the JSON.
#[tauri::command]
pub async fn inv_session_fetch() -> Result<String, String> {
    let pid = tauri::async_runtime::spawn_blocking(game_pid).await.map_err(|e| format!("rust.inv.failed|{e}"))?.ok_or("rust.inv.noGame")?;

    // Same launch: try the cached pair without touching the game.
    if let Some(s) = load_session() {
        if s.pid == pid {
            if let Ok(body) = request(&s.authz).await {
                if looks_like_inventory(&body) {
                    return Ok(body);
                }
            }
            // Rejected (re-login) or bad reply: drop it and read the game once more.
            clear_session();
        }
    }

    let authz = tauri::async_runtime::spawn_blocking(move || scan(pid)).await.map_err(|e| format!("rust.inv.failed|{e}"))??;
    let body = request(&authz).await?;
    if !looks_like_inventory(&body) {
        return Err("rust.inv.badAnswer".into());
    }
    save_session(&Session { pid, authz });
    Ok(body)
}

// The game is running at all (for the UI hint): no process is opened.
#[tauri::command]
pub fn inv_session_game_running() -> bool {
    game_pid().is_some()
}

#[tauri::command]
pub fn inv_session_clear() {
    clear_session();
}
