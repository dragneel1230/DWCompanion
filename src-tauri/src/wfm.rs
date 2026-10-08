// warframe.market sign-in and the player's own orders.
// WFM has no OAuth for third-party apps yet and its password sign-in needs App Check, which only their
// own clients get. So the player signs in on the real site in our window (the password never reaches
// us); we take the site's JWT cookie, check it with /v2/me and keep it in Windows Credential Manager.
// The token stays on this side: the page calls a few whitelisted endpoints through wfm_call.
// Only on the player's click, ~3 requests per second (their rule). Not DE: no game session, no nonce.
use serde_json::Value;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_http::reqwest;

const API: &str = "https://api.warframe.market/v2";
const SITE: &str = "https://warframe.market/";
const SIGNIN: &str = "https://warframe.market/auth/signin";
const LOGIN_WINDOW: &str = "wfm-login";
const CRED_TARGET: &str = "DWCompanion/warframe.market";
const GAP: Duration = Duration::from_millis(340);

#[derive(Default)]
pub struct Wfm {
    token: Mutex<Option<String>>,
    last: Mutex<Option<Instant>>,
}

impl Wfm {
    pub fn token(&self) -> Option<String> {
        self.token.lock().unwrap().clone()
    }
}

pub fn init() -> Wfm {
    Wfm { token: Mutex::new(crate::cred::read(CRED_TARGET)), last: Mutex::new(None) }
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(concat!("DWCompanion/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(20))
        .build()
        .expect("http client")
}

async fn wait_turn(state: &Wfm) {
    let wait = {
        let mut last = state.last.lock().unwrap();
        let now = Instant::now();
        let next = last.map(|t| t + GAP).filter(|t| *t > now).unwrap_or(now);
        *last = Some(next);
        next - now
    };
    if !wait.is_zero() {
        tokio_sleep(wait).await;
    }
}

async fn tokio_sleep(d: Duration) {
    // tauri's runtime is tokio; avoid a direct dependency.
    tauri::async_runtime::spawn_blocking(move || std::thread::sleep(d)).await.ok();
}

// The csrf_token claim of a JWT: the site's double-submit check for changes made with the cookie.
fn csrf_of(token: &str) -> Option<String> {
    use base64::Engine;
    let part = token.split('.').nth(1)?;
    let raw = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(part.trim_end_matches('=')).ok()?;
    let v: Value = serde_json::from_slice(&raw).ok()?;
    v.get("csrf_token")?.as_str().map(str::to_string)
}

// One request with the token. Ok(None) on 401: the session is over.
// WFM rotates the session token through the response's Authorization header (seen in WFHelper):
// with `keep`, a new token replaces the saved one, else the session quietly expires.
// The site's token is a cookie-type JWT: if the header form is refused, the same request goes again
// the way the site itself sends it (cookie + X-CSRFToken, no Authorization), as WFHelper falls back.
async fn request(keep: Option<&Wfm>, token: &str, method: reqwest::Method, path: &str, body: Option<Value>) -> Result<Option<Value>, String> {
    match send(keep, token, method.clone(), path, body.clone(), true).await? {
        None => send(keep, token, method, path, body, false).await,
        v => Ok(v),
    }
}

async fn send(keep: Option<&Wfm>, token: &str, method: reqwest::Method, path: &str, body: Option<Value>, header: bool) -> Result<Option<Value>, String> {
    let mut req = client().request(method, format!("{API}{path}"));
    if header {
        req = req.header("Authorization", format!("Bearer {token}"));
    }
    req = req
        .header("Cookie", format!("JWT={token}"))
        .header("Platform", "pc")
        .header("Crossplay", "true")
        .header("Language", "en")
        .header("Accept", "application/json");
    if let Some(csrf) = csrf_of(token) {
        req = req.header("X-CSRFToken", csrf);
    }
    if let Some(b) = body {
        req = req.header("Content-Type", "application/json").body(b.to_string());
    }
    let res = req.send().await.map_err(|_| "rust.wfm.net".to_string())?;
    let status = res.status();
    if let (Some(state), Some(h)) = (keep, res.headers().get("authorization").and_then(|h| h.to_str().ok())) {
        let fresh = h.trim_start_matches("Bearer ").trim_start_matches("JWT ").trim();
        if fresh.len() > 100 && fresh != token && fresh.split('.').count() == 3 {
            *state.token.lock().unwrap() = Some(fresh.to_string());
            crate::cred::write(CRED_TARGET, fresh);
        }
    }
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Ok(None);
    }
    let text = res.text().await.unwrap_or_default();
    if !status.is_success() {
        let detail = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| v.get("error").map(|e| e.to_string()))
            .unwrap_or_default();
        return Err(format!("rust.wfm.http|{} {}", status.as_u16(), detail.chars().take(200).collect::<String>()));
    }
    Ok(Some(serde_json::from_str::<Value>(&text).unwrap_or(Value::Null)))
}

// The signed-in user from /v2/me, or None for a guest / expired token.
async fn me(keep: Option<&Wfm>, token: &str) -> Result<Option<Value>, String> {
    let v = request(keep, token, reqwest::Method::GET, "/me", None).await?;
    Ok(v.and_then(|v| v.get("data").cloned()).filter(|d| {
        d.get("ingameName").and_then(|n| n.as_str()).is_some_and(|n| !n.is_empty())
    }))
}

#[tauri::command]
pub async fn wfm_me(app: AppHandle) -> Result<Option<Value>, String> {
    let state = app.state::<Wfm>();
    let Some(token) = state.token.lock().unwrap().clone() else { return Ok(None) };
    wait_turn(&state).await;
    let user = me(Some(&state), &token).await?;
    if user.is_none() {
        forget(&state);
    }
    Ok(user)
}

#[tauri::command]
pub fn wfm_logout(app: AppHandle) {
    forget(&app.state::<Wfm>());
    crate::wfm_status::stop(&app);
    let _ = app.emit("wfm-auth", Value::Null);
}

fn forget(state: &Wfm) {
    *state.token.lock().unwrap() = None;
    crate::cred::delete(CRED_TARGET);
}

// Opens the site's sign-in page. A private session: nothing stays in the app's own browser profile.
// The window is polled for the JWT cookie; a new value is checked with /v2/me, and on success the
// token is saved, "wfm-auth" goes to every window with the user, and the login window closes.
#[tauri::command]
pub async fn wfm_login(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(LOGIN_WINDOW) {
        let _ = w.set_focus();
        return Ok(());
    }
    let url = SIGNIN.parse().map_err(|_| "rust.wfm.net".to_string())?;
    let win = WebviewWindowBuilder::new(&app, LOGIN_WINDOW, WebviewUrl::External(url))
        .title("warframe.market")
        .inner_size(520.0, 760.0)
        .incognito(true)
        .build()
        .map_err(|e| format!("rust.wfm.window|{e}"))?;
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        let site: tauri::Url = SITE.parse().unwrap();
        let mut seen: Option<String> = None;
        let started = Instant::now();
        // 20 minutes is plenty to type a password and pass a captcha.
        while started.elapsed() < Duration::from_secs(20 * 60) {
            tokio_sleep(Duration::from_millis(1200)).await;
            let Some(w) = app2.get_webview_window(LOGIN_WINDOW) else { return };
            let jwt = w
                .cookies_for_url(site.clone())
                .ok()
                .and_then(|list| list.into_iter().find(|c| c.name() == "JWT").map(|c| c.value().to_string()));
            let Some(jwt) = jwt else { continue };
            if seen.as_deref() == Some(jwt.as_str()) {
                continue;
            }
            seen = Some(jwt.clone());
            let state = app2.state::<Wfm>();
            wait_turn(&state).await;
            if let Ok(Some(user)) = me(None, &jwt).await {
                crate::cred::write(CRED_TARGET, &jwt);
                *state.token.lock().unwrap() = Some(jwt);
                let _ = app2.emit("wfm-auth", user);
                let _ = w.close();
                return;
            }
        }
        if let Some(w) = app2.get_webview_window(LOGIN_WINDOW) {
            let _ = w.close();
        }
    });
    drop(win);
    Ok(())
}

// The endpoints the page may call: own orders only.
fn allowed(method: &str, path: &str) -> bool {
    let id = |s: &str| !s.is_empty() && s.len() <= 40 && s.chars().all(|c| c.is_ascii_alphanumeric());
    let parts: Vec<&str> = path.trim_start_matches('/').split('/').collect();
    match (method, parts.as_slice()) {
        ("GET", ["orders", "my"]) | ("POST", ["order"]) => true,
        ("PATCH" | "DELETE", ["order", x]) => id(x),
        ("POST", ["order", x, "close"]) => id(x),
        _ => false,
    }
}

#[tauri::command]
pub async fn wfm_call(app: AppHandle, method: String, path: String, body: Option<Value>) -> Result<Value, String> {
    if !allowed(&method, &path) {
        return Err("rust.wfm.denied".into());
    }
    let state = app.state::<Wfm>();
    let Some(token) = state.token.lock().unwrap().clone() else { return Err("rust.wfm.noAuth".into()) };
    let m = reqwest::Method::from_bytes(method.as_bytes()).map_err(|_| "rust.wfm.denied".to_string())?;
    wait_turn(&state).await;
    match request(Some(&state), &token, m, &path, body).await? {
        Some(v) => Ok(v),
        None => {
            forget(&state);
            let _ = app.emit("wfm-auth", Value::Null);
            Err("rust.wfm.noAuth".into())
        }
    }
}

