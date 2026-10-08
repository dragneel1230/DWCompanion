// The player's status on warframe.market ("in game" / "online" / "invisible"), as the site's own
// status menu sets it: one WebSocket to WFM (wss://ws.warframe.market/socket, protocol "wfm"),
// sign in with the session token, then "@wfm|cmd/status/set" (the same route the site sends).
// Two modes, both only after the player turns them on:
// - manual: a status, optionally for N minutes (also sent as `duration`, so the site keeps it that long
//   even if the app is closed — the site's "keep status for"); when the time is up -> offline;
// - auto: "in game" while the Warframe window exists (found by its title, as the hub does — no access to
//   the game process), invisible a little after the game is closed.
// Without a connection WFM shows the player offline. Nothing in the game is touched.
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, Message};

const WS_URL: &str = "wss://ws.warframe.market/socket";
const GAME_TITLE: &str = "Warframe";
// Game closed -> invisible only after this: a restart or a crash report should not flicker the status.
const GAME_GRACE: Duration = Duration::from_secs(90);
const MAX_DURATION: u64 = 21_600; // the site's limit for `duration`, seconds

#[derive(Clone, Serialize, Default)]
pub struct Info {
    pub connected: bool,
    pub status: Option<String>, // what WFM confirmed last
    pub want: Option<String>,   // what we keep
    pub until: Option<u64>,     // unix ms: manual status ends (then offline / auto)
    pub auto: bool,
    pub game: bool,
    pub error: Option<String>, // rust.<key>
}

enum Cmd {
    Set { status: String, minutes: Option<u32> },
    Auto(bool),
    Stop,
}

#[derive(Default)]
pub struct WfmStatus {
    tx: Mutex<Option<mpsc::UnboundedSender<Cmd>>>,
    info: Mutex<Info>,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn game_running() -> bool {
    use windows::core::HSTRING;
    use windows::Win32::UI::WindowsAndMessaging::FindWindowW;
    unsafe { FindWindowW(None, &HSTRING::from(GAME_TITLE)).is_ok_and(|h| !h.is_invalid()) }
}

// For the app's «Сейчас»: is the Warframe window open (the hub learns it from its own window search).
#[tauri::command]
pub fn game_window_open() -> bool {
    game_running()
}

fn publish(app: &AppHandle, f: impl FnOnce(&mut Info)) {
    let st = app.state::<WfmStatus>();
    let info = {
        let mut i = st.info.lock().unwrap();
        f(&mut i);
        i.clone()
    };
    let _ = app.emit("wfm-status", info);
}

fn send_cmd(app: &AppHandle, cmd: Cmd) {
    let st = app.state::<WfmStatus>();
    let mut tx = st.tx.lock().unwrap();
    if tx.as_ref().is_none_or(|t| t.is_closed()) {
        let (t, rx) = mpsc::unbounded_channel();
        *tx = Some(t);
        tauri::async_runtime::spawn(run(app.clone(), rx));
    }
    let _ = tx.as_ref().unwrap().send(cmd);
}

#[tauri::command]
pub fn wfm_status_get(app: AppHandle) -> Info {
    app.state::<WfmStatus>().info.lock().unwrap().clone()
}

#[tauri::command]
pub fn wfm_status_set(app: AppHandle, status: String, minutes: Option<u32>) -> Result<(), String> {
    if !matches!(status.as_str(), "ingame" | "online" | "invisible") {
        return Err("rust.wfm.denied".into());
    }
    send_cmd(&app, Cmd::Set { status, minutes });
    Ok(())
}

#[tauri::command]
pub fn wfm_status_auto(app: AppHandle, on: bool) {
    send_cmd(&app, Cmd::Auto(on));
}

// Sign-out: close the socket (WFM then shows the player offline).
pub fn stop(app: &AppHandle) {
    let st = app.state::<WfmStatus>();
    if let Some(tx) = st.tx.lock().unwrap().take() {
        let _ = tx.send(Cmd::Stop);
    }
    publish(app, |i| *i = Info::default());
}

// What to keep: the manual status while its time lasts, else the game-driven one, else nothing.
struct Plan {
    manual: Option<(String, Option<u64>)>, // status, until (unix ms)
    auto: bool,
    game: bool,
    game_gone_at: Option<u64>,
}

impl Plan {
    fn want(&self) -> Option<String> {
        if let Some((s, _)) = &self.manual {
            return Some(s.clone());
        }
        if self.auto {
            let away = self.game_gone_at.is_some_and(|t| now_ms() >= t + GAME_GRACE.as_millis() as u64);
            return Some(if self.game || !away { "ingame" } else { "invisible" }.into());
        }
        None
    }
}

fn status_msg(status: &str, until: Option<u64>) -> Message {
    let mut payload = json!({ "status": status });
    if let Some(u) = until {
        let secs = (u.saturating_sub(now_ms()) / 1000).clamp(60, MAX_DURATION);
        payload["duration"] = json!(secs);
    }
    msg("@wfm|cmd/status/set", payload)
}

fn msg(route: &str, payload: Value) -> Message {
    let id = format!("dwc{}", now_ms() % 100_000_000);
    Message::Text(json!({ "route": route, "payload": payload, "id": id }).to_string().into())
}

async fn run(app: AppHandle, mut rx: mpsc::UnboundedReceiver<Cmd>) {
    let mut plan = Plan { manual: None, auto: false, game: game_running(), game_gone_at: None };
    let mut backoff = 0u64;
    'outer: loop {
        // Nothing to keep: wait for a command, no socket.
        while plan.want().is_none() {
            publish(&app, |i| {
                i.connected = false;
                i.status = None;
                i.want = None;
                i.until = None;
                i.auto = false;
            });
            match rx.recv().await {
                Some(Cmd::Stop) | None => return,
                Some(c) => apply(&mut plan, c),
            }
        }
        let token = app.state::<crate::wfm::Wfm>().token();
        let Some(token) = token else {
            publish(&app, |i| i.error = Some("rust.wfm.noAuth".into()));
            plan = Plan { manual: None, auto: false, game: plan.game, game_gone_at: None };
            continue;
        };
        let mut req = WS_URL.into_client_request().expect("ws url");
        let h = req.headers_mut();
        h.insert("Sec-WebSocket-Protocol", "wfm".parse().unwrap());
        h.insert("User-Agent", concat!("DWCompanion/", env!("CARGO_PKG_VERSION")).parse().unwrap());
        if let Ok(c) = format!("JWT={token}").parse() {
            h.insert("Cookie", c);
        }
        let ws = tokio::time::timeout(Duration::from_secs(15), tokio_tungstenite::connect_async(req)).await;
        let mut ws = match ws {
            Ok(Ok((ws, _))) => ws,
            _ => {
                publish(&app, |i| {
                    i.connected = false;
                    i.error = Some("rust.wfm.net".into());
                });
                backoff = (backoff * 2).clamp(5, 120);
                if wait_or_cmd(&mut rx, &mut plan, Duration::from_secs(backoff)).await {
                    return;
                }
                continue;
            }
        };
        if ws.send(msg("@wfm|cmd/auth/signIn", json!({ "token": token }))).await.is_err() {
            continue;
        }
        let mut sent: Option<(String, Option<u64>)> = None;
        let mut signed = false;
        let mut tick = tokio::time::interval(Duration::from_secs(5));
        loop {
            // Keep WFM in line with the plan once signed in.
            if signed {
                let want = plan.want();
                let until = plan.manual.as_ref().and_then(|m| m.1);
                if let Some(w) = &want {
                    if sent.as_ref() != Some(&(w.clone(), until)) {
                        if ws.send(status_msg(w, until)).await.is_err() {
                            break;
                        }
                        sent = Some((w.clone(), until));
                    }
                } else {
                    // Nothing to keep any more: let the site decide (offline without a socket).
                    let _ = ws.close(None).await;
                    continue 'outer;
                }
                publish(&app, |i| {
                    i.want = want.clone();
                    i.until = until;
                    i.auto = plan.auto;
                    i.game = plan.game;
                });
            }
            tokio::select! {
                c = rx.recv() => match c {
                    Some(Cmd::Stop) | None => {
                        let _ = ws.close(None).await;
                        return;
                    }
                    Some(c) => apply(&mut plan, c),
                },
                m = ws.next() => match m {
                    Some(Ok(Message::Text(t))) => {
                        let v: Value = serde_json::from_str(&t).unwrap_or(Value::Null);
                        let route = v.get("route").and_then(|r| r.as_str()).unwrap_or("");
                        let payload = v.get("payload").cloned().unwrap_or(Value::Null);
                        match route {
                            "@wfm|cmd/auth/signIn:ok" => {
                                signed = true;
                                backoff = 0;
                                publish(&app, |i| { i.connected = true; i.error = None; });
                            }
                            "@wfm|cmd/auth/signIn:error" | "@wfm|event/auth/revoke" => {
                                let _ = ws.close(None).await;
                                plan = Plan { manual: None, auto: false, game: plan.game, game_gone_at: None };
                                publish(&app, |i| { i.connected = false; i.status = None; i.error = Some("rust.wfm.statusAuth".into()); });
                                continue 'outer;
                            }
                            "@wfm|event/status/set" | "@wfm|cmd/status/set:ok" => {
                                if let Some(s) = payload.get("status").and_then(|s| s.as_str()) {
                                    let s = s.to_string();
                                    publish(&app, |i| i.status = Some(s));
                                }
                            }
                            r if r.ends_with(":error") => {
                                let detail = payload.to_string().chars().take(120).collect::<String>();
                                publish(&app, |i| i.error = Some(format!("rust.wfm.statusErr|{detail}")));
                            }
                            _ => {}
                        }
                    }
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    _ => {}
                },
                _ = tick.tick() => {
                    let game = game_running();
                    if game != plan.game {
                        plan.game = game;
                        plan.game_gone_at = if game { None } else { Some(now_ms()) };
                    }
                    if plan.manual.as_ref().and_then(|m| m.1).is_some_and(|u| now_ms() >= u) {
                        // Time is up: back to auto, or close the socket (WFM then shows the player offline).
                        plan.manual = None;
                    }
                }
            }
        }
        // Dropped: reconnect with a growing pause, keeping the plan.
        publish(&app, |i| {
            i.connected = false;
            i.status = None;
        });
        backoff = (backoff * 2).clamp(5, 120);
        if wait_or_cmd(&mut rx, &mut plan, Duration::from_secs(backoff)).await {
            return;
        }
    }
}

// Waits, still taking commands. true = stop.
async fn wait_or_cmd(rx: &mut mpsc::UnboundedReceiver<Cmd>, plan: &mut Plan, d: Duration) -> bool {
    let end = tokio::time::sleep(d);
    tokio::pin!(end);
    loop {
        tokio::select! {
            _ = &mut end => return false,
            c = rx.recv() => match c {
                Some(Cmd::Stop) | None => return true,
                Some(c) => apply(plan, c),
            },
        }
    }
}

fn apply(plan: &mut Plan, c: Cmd) {
    match c {
        Cmd::Set { status, minutes } => {
            let until = minutes.filter(|m| *m > 0).map(|m| now_ms() + m as u64 * 60_000);
            plan.manual = Some((status, until));
            plan.auto = false;
        }
        Cmd::Auto(on) => {
            plan.auto = on;
            plan.manual = None;
            plan.game = game_running();
            plan.game_gone_at = if plan.game { None } else { Some(0) };
        }
        Cmd::Stop => {}
    }
}
