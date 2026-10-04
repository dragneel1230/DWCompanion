// Relic reward scanner: EE.log says the reward screen is opening -> read the card names from the
// screen (Windows Graphics Capture + Windows OCR) -> send them to the overlay window.
// Nothing is sent to the game; we only read EE.log and look at the screen.
//
// Layout measured at 1920x1080 (scaled by height for other resolutions): up to 4 cards centered on
// the screen, 241.5 px apart; name text in y 410..462; card frames y 224..460.

use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use image::RgbaImage;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use windows_capture::capture::{Context, GraphicsCaptureApiHandler};
use windows_capture::frame::Frame;
use windows_capture::graphics_capture_api::InternalCaptureControl;
use windows_capture::monitor::Monitor;
use windows_capture::settings::{
    ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings, MinimumUpdateIntervalSettings,
    SecondaryWindowSettings, Settings,
};

use crate::ocr::{Ocr, Prep, Word};

const CARD_STEP: f32 = 241.5;
const TEXT_W: f32 = 238.0;
const TEXT_Y: f32 = 410.0;
const TEXT_H: f32 = 52.0;
// Endless missions (Survival...) open the screen with a 5 s pause countdown before the cards
// ("OpenVoidProjectionRewardScreenRMI" ... "Pause countdown done"), plus EE.log write delay.
const SCAN_FOR: Duration = Duration::from_secs(10);
const SCAN_EVERY: Duration = Duration::from_millis(60);

pub struct Squad {
    relics: Vec<String>, // "T1VoidProjectionProteaPrimeAPlatinum", seen since the mission started
    scanning: bool,
    last_scan: Option<Instant>,
    enabled: bool, // overlay switched on in the app; off = the screen is not captured at all
    pub(crate) names: Vec<String>, // every relic reward as shown on the card, compacted (sent by the app)
    mission: Mission,
    pub(crate) lang: String, // the game client's language, from EE.log ("ru", "en"): OCR and the card names follow it
}

// Where the player is, from EE.log (for the hub's "Сейчас" block).
#[derive(Clone, Default, Serialize)]
pub struct Mission {
    pub active: bool,
    pub name: Option<String>, // "Martialis (Марс) - Разрыв: Лит", in the client's language
    pub node: Option<String>, // "SolNode763" when joining a mission in progress (no name line then)
    pub relics: Vec<String>,
    pub my_relic: Option<String>, // the relic the player took, as the game names it ("Реликвия Лит P9 [СИЯЮЩАЯ]")
    pub lobby: Option<Lobby>,     // on the ship with a mission picked, before it starts
}

#[derive(Clone, Default, Serialize)]
pub struct Lobby {
    pub tier: Option<String>, // "VoidT1" for a fissure
    pub node: Option<String>, // "SolNode36"
    pub name: Option<String>, // "Martialis (Марс) - Разрыв: Лит"
}

impl Default for Squad {
    fn default() -> Self {
        Self { relics: Vec::new(), scanning: false, last_scan: None, enabled: true, names: Vec::new(), mission: Mission::default(), lang: "ru".into() }
    }
}

pub type SquadState = Arc<Mutex<Squad>>;

#[derive(Clone, Serialize)]
pub struct Card {
    // Text box of the card name in physical screen pixels.
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub texts: Vec<String>, // one per OCR variant
}

#[derive(Clone, Serialize)]
pub struct Scan {
    pub cards: Vec<Card>,
    pub screen_w: u32,
    pub screen_h: u32,
    pub scale: f32,
    pub ms: u64,       // from the trigger line to the result
    pub ocr_ms: u64,   // OCR time of the accepted frame
    pub frames: u32,   // frames looked at
    pub relics: Vec<String>,
    pub lang: String, // client language the names were read in
}

pub fn init() -> SquadState {
    Arc::new(Mutex::new(Squad::default()))
}

// Every EE.log line goes through here (called from the log tail in bench.rs).
pub fn on_line(app: &AppHandle, line: &str) {
    let Some(squad) = app.try_state::<SquadState>().map(|s| s.inner().clone()) else { return };
    if track_lang(&squad, line) {
        let lang = squad.lock().unwrap().lang.clone();
        let _ = app.emit("client-lang", lang);
    }
    if track_mission(&squad, line) {
        let m = squad.lock().unwrap().mission.clone();
        let _ = app.emit("mission-state", m);
    }
    if line.contains("ThemedSquadOverlay.lua: Mission name:") {
        squad.lock().unwrap().relics.clear();
        let _ = app.emit("squad-relics", Vec::<String>::new());
    } else if let Some(name) = relic_in(line) {
        let mut s = squad.lock().unwrap();
        if !s.relics.contains(&name) {
            s.relics.push(name);
            let _ = app.emit("squad-relics", s.relics.clone());
        }
    } else if line.contains("OpenVoidProjectionRewardScreen") || line.contains("ProjectionRewardChoice.lua: Got rewards") {
        start_scan(app, &squad);
    } else if line.contains("ProjectionRewardChoice.lua: Relic reward screen shut down") {
        let _ = app.emit("reward-close", ());
        crate::overlay::hide(app);
    }
}

// The client's language, written at the game's start: "Process Command-line: ... -language:ru ..." and
// "Sys [Info]: Using language: _ru". Returns true on a change. Also fed with the log written before the
// app started (bench.rs).
pub fn track_lang(squad: &SquadState, line: &str) -> bool {
    let code = if let Some(i) = line.find("Sys [Info]: Using language: _") {
        &line[i + "Sys [Info]: Using language: _".len()..]
    } else if let (true, Some(i)) = (line.contains("Process Command-line:"), line.find(" -language:")) {
        &line[i + " -language:".len()..]
    } else {
        return false;
    };
    let code: String = code.chars().take_while(|c| c.is_ascii_alphanumeric()).collect::<String>().to_lowercase();
    let mut s = squad.lock().unwrap();
    if code.is_empty() || s.lang == code {
        return false;
    }
    s.lang = code;
    true
}

// Mission state lines (checked on the 2026-09 log of the ru client). Returns true on a change.
// Also fed with the log written before the app started (bench.rs), so a mission in progress is known.
pub fn track_mission(squad: &SquadState, line: &str) -> bool {
    let mut s = squad.lock().unwrap();
    let m = &mut s.mission;
    // {"difficulty":"","voidTier":"VoidT1","quest":"","name":"SolNode36_ActiveMission"} -> field value
    let field = |key: &str| {
        line.split(&format!("\"{key}\":\"")).nth(1).and_then(|r| r.split('"').next()).filter(|v| !v.is_empty()).map(str::to_string)
    };
    if let Some(i) = line.find("ThemedSquadOverlay.lua: Mission name: ") {
        let name = line[i + "ThemedSquadOverlay.lua: Mission name: ".len()..].trim().to_string();
        let my_relic = m.my_relic.take();
        *m = Mission { active: true, name: Some(name), my_relic, ..Default::default() };
    } else if line.contains("Client joining mission in-progress:") {
        // ... in-progress: {"difficulty":1,"wager":"2","name":"SolNode763"}
        let node = field("name").map(|n| n.trim_end_matches("_ActiveMission").to_string());
        let my_relic = m.my_relic.take();
        *m = Mission { active: true, node, my_relic, ..Default::default() };
    } else if line.contains("ServerFramework:OpenLevel - /Lotus/Levels/Proc/PlayerShip") {
        if !m.active && m.relics.is_empty() && m.lobby.is_none() && m.my_relic.is_none() {
            return false;
        }
        *m = Mission::default();
    } else if line.contains("Net [Info]: Set squad mission: {") || line.contains("Net [Info]: Requested mission: {") {
        if m.active {
            return false;
        }
        let node = field("name").map(|n| n.trim_end_matches("_ActiveMission").to_string());
        let lobby = m.lobby.get_or_insert_with(Lobby::default);
        if node != lobby.node {
            lobby.name = None;
        }
        lobby.tier = field("voidTier");
        lobby.node = node;
    } else if let Some(i) = line.find("ThemedSquadOverlay.lua: Cached mission name=") {
        if m.active {
            return false;
        }
        // "Martialis (Марс) - Разрыв: Лит (SolNode36)"
        let raw = line[i + "ThemedSquadOverlay.lua: Cached mission name=".len()..].trim();
        let name = raw.rfind(" (SolNode").map_or(raw, |j| &raw[..j]).to_string();
        m.lobby.get_or_insert_with(Lobby::default).name = Some(name);
    } else if line.contains("ThemedSquadOverlay.lua: ResetSquadMission") {
        if m.active || m.lobby.is_none() {
            return false;
        }
        m.lobby = None;
    } else if let Some(r) = crate::journal::relic_in_dialog(line) {
        if m.my_relic.as_ref() == Some(&r) {
            return false;
        }
        m.my_relic = Some(r);
    } else if let Some(r) = relic_in(line) {
        if !m.active || m.relics.contains(&r) {
            return false;
        }
        m.relics.push(r);
    } else {
        return false;
    }
    true
}

// "(/Lotus/Types/Game/Projections/T1VoidProjectionProteaPrimeAPlatinum)" -> the type name.
fn relic_in(line: &str) -> Option<String> {
    let i = line.find("/Projections/T")? + "/Projections/".len();
    let rest = &line[i..];
    let end = rest.find(|c: char| !c.is_ascii_alphanumeric())?;
    let name = &rest[..end];
    name.contains("VoidProjection").then(|| name.to_string())
}

fn start_scan(app: &AppHandle, squad: &SquadState) {
    {
        let mut s = squad.lock().unwrap();
        // "Got rewards" comes seconds after the open line: one scan per screen.
        if !s.enabled || s.scanning || s.last_scan.is_some_and(|t| t.elapsed() < Duration::from_secs(20)) {
            return;
        }
        s.scanning = true;
        s.last_scan = Some(Instant::now());
    }
    let (relics, names, lang) = {
        let s = squad.lock().unwrap();
        (s.relics.clone(), s.names.clone(), s.lang.clone())
    };
    let _ = app.emit("reward-open", relics.clone());
    let (app, squad) = (app.clone(), squad.clone());
    thread::spawn(move || {
        let result = (|| -> Result<(), String> {
            let monitor = Monitor::primary().map_err(|e| e.to_string())?;
            let settings = Settings::new(
                monitor,
                CursorCaptureSettings::WithoutCursor,
                DrawBorderSettings::WithoutBorder,
                SecondaryWindowSettings::Default,
                MinimumUpdateIntervalSettings::Custom(Duration::from_millis(15)),
                DirtyRegionSettings::Default,
                ColorFormat::Rgba8,
                ScanFlags { app: app.clone(), relics, names, lang },
            );
            Scanner::start(settings).map_err(|e| e.to_string())
        })();
        if let Err(e) = result {
            let _ = app.emit("reward-error", e);
        }
        squad.lock().unwrap().scanning = false;
    });
}

struct ScanFlags {
    app: AppHandle,
    relics: Vec<String>,
    names: Vec<String>,
    lang: String,
}

struct Scanner {
    app: AppHandle,
    relics: Vec<String>,
    names: Vec<String>,
    lang: String,
    ocr: Ocr,
    start: Instant,
    last: Option<Instant>,
    frames: u32,
    scratch: Vec<u8>,
}

impl GraphicsCaptureApiHandler for Scanner {
    type Flags = ScanFlags;
    type Error = Box<dyn std::error::Error + Send + Sync>;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        Ok(Self {
            app: ctx.flags.app,
            relics: ctx.flags.relics,
            names: ctx.flags.names,
            ocr: Ocr::new(&ctx.flags.lang).map_err(|e| format!("rust.ocrMissing|{} ({e})", ctx.flags.lang))?,
            lang: ctx.flags.lang,
            start: Instant::now(),
            last: None,
            frames: 0,
            scratch: Vec::new(),
        })
    }

    fn on_frame_arrived(&mut self, frame: &mut Frame, control: InternalCaptureControl) -> Result<(), Self::Error> {
        if self.start.elapsed() > SCAN_FOR {
            let _ = self.app.emit("reward-error", "rust.rewardTimeout");
            control.stop();
            return Ok(());
        }
        if self.last.is_some_and(|t| t.elapsed() < SCAN_EVERY) {
            return Ok(());
        }
        self.last = Some(Instant::now());
        self.frames += 1;

        let (w, h) = (frame.width(), frame.height());
        let fb = frame.buffer()?;
        let pixels = fb.as_nopadding_buffer(&mut self.scratch).to_vec();
        let Some(img) = RgbaImage::from_raw(w, h, pixels) else { return Ok(()) };

        let t = Instant::now();
        if let Some(cards) = read_cards(&self.ocr, &img, &self.names)? {
            let scan = Scan {
                cards,
                screen_w: w,
                screen_h: h,
                scale: h as f32 / 1080.0,
                ms: self.start.elapsed().as_millis() as u64,
                ocr_ms: t.elapsed().as_millis() as u64,
                frames: self.frames,
                relics: self.relics.clone(),
                lang: self.lang.clone(),
            };
            crate::bench::save_scan(&self.app, &img, &scan);
            crate::overlay::show(&self.app);
            let _ = self.app.emit("reward-scan", scan);
            control.stop();
        }
        Ok(())
    }
}

// Runs the recognizer on a saved frame (PNG from the bench session): tests OCR without the game.
// `lang`: the client language of the recording (default "ru").
#[tauri::command]
pub fn reward_scan_file(path: String, lang: Option<String>) -> Result<Option<Scan>, String> {
    let lang = lang.unwrap_or_else(|| "ru".into());
    let img = image::open(&path).map_err(|e| e.to_string())?.to_rgba8();
    let (w, h) = img.dimensions();
    let ocr = Ocr::new(&lang).map_err(|e| format!("rust.ocrMissing|{lang} ({e})"))?;
    let t = Instant::now();
    let cards = read_cards(&ocr, &img, &[]).map_err(|e| e.to_string())?;
    Ok(cards.map(|cards| Scan {
        cards,
        screen_w: w,
        screen_h: h,
        scale: h as f32 / 1080.0,
        ms: 0,
        ocr_ms: t.elapsed().as_millis() as u64,
        frames: 1,
        relics: Vec::new(),
        lang,
    }))
}

// Replays a saved frame through the whole path (recognition -> overlay), for testing without the game.
#[tauri::command]
pub fn reward_replay(app: AppHandle, path: String, relics: Vec<String>, lang: Option<String>) -> Result<bool, String> {
    let Some(mut scan) = reward_scan_file(path, lang)? else { return Ok(false) };
    scan.relics = relics;
    crate::overlay::show(&app);
    let _ = app.emit("reward-scan", scan);
    Ok(true)
}

// Every relic reward's card name, from the app's database: lets the scanner tell real cards from
// other text in the name strip (the pause countdown of endless missions).
#[tauri::command]
pub fn reward_names(app: AppHandle, names: Vec<String>) {
    if let Some(sq) = app.try_state::<SquadState>() {
        sq.lock().unwrap().names = names.iter().map(|n| compact(n)).collect();
    }
}

// The game client's language (EE.log), for the card names the app sends (reward_names).
#[tauri::command]
pub fn client_lang(squad: tauri::State<SquadState>) -> String {
    squad.lock().unwrap().lang.clone()
}

#[tauri::command]
pub fn mission_state(squad: tauri::State<SquadState>) -> Mission {
    squad.lock().unwrap().mission.clone()
}

// Settings from the app (saved on its side, sent at start and on change).
#[tauri::command]
pub fn overlay_config(app: AppHandle, enabled: bool, record: bool) {
    if let Some(sq) = app.try_state::<SquadState>() {
        sq.lock().unwrap().enabled = enabled;
    }
    crate::bench::set_recording(&app, record);
}

// Example for the settings page: replays the newest saved scan frame.
#[tauri::command]
pub fn overlay_demo(app: AppHandle) -> Result<bool, String> {
    let base = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("bench");
    let mut newest: Option<(std::time::SystemTime, std::path::PathBuf)> = None;
    for session in std::fs::read_dir(&base).map_err(|e| e.to_string())?.flatten() {
        for f in std::fs::read_dir(session.path()).into_iter().flatten().flatten() {
            let p = f.path();
            let is_scan = p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with("scan-") && n.ends_with(".png"));
            let t = f.metadata().and_then(|m| m.modified()).ok();
            if let (true, Some(t)) = (is_scan, t) {
                if newest.as_ref().is_none_or(|(nt, _)| t > *nt) {
                    newest = Some((t, p));
                }
            }
        }
    }
    let Some((_, path)) = newest else { return Err("rust.noScans".into()) };
    let saved = std::fs::read_to_string(path.with_extension("json"))
        .ok()
        .and_then(|j| serde_json::from_str::<serde_json::Value>(&j).ok())
        .unwrap_or_default();
    let relics = serde_json::from_value::<Vec<String>>(saved["relics"].clone()).unwrap_or_default();
    // Scans saved before the client language was recorded are from the Russian client.
    let lang = saved["lang"].as_str().map(str::to_string);
    reward_replay(app, path.display().to_string(), relics, lang)
}

// None = the names are not on screen yet (countdown, "Загрузка..." / "Loading...", fade-in).
// With `names` (compacted reward names), at least half of the cards must read like one of them.
fn read_cards(ocr: &Ocr, img: &RgbaImage, names: &[String]) -> windows::core::Result<Option<Vec<Card>>> {
    let (w, h) = img.dimensions();
    let s = h as f32 / 1080.0;
    let cx = w as f32 / 2.0;
    let step = CARD_STEP * s;

    // 1. The whole strip once: is there text, and how many cards (1..4, centered)?
    let (x0, y0) = (cx - 2.0 * step, TEXT_Y * s);
    let (text, words) = ocr.region(img, x0 as u32, y0 as u32, (4.0 * step) as u32, (TEXT_H * s) as u32, 1.0, Prep::Color)?;
    let lower = text.to_lowercase();
    if words.is_empty() || lower.contains("загрузка") || lower.contains("loading") {
        return Ok(None);
    }
    let Some(n) = card_count(&words, cx, step) else { return Ok(None) };

    // 2. Each card separately, two variants: sharper results than the whole strip.
    let mut cards = Vec::new();
    for i in 0..n {
        let ccx = cx + (i as f32 - (n as f32 - 1.0) / 2.0) * step;
        let (x, y, cw, ch) = (ccx - TEXT_W * s / 2.0, TEXT_Y * s, TEXT_W * s, TEXT_H * s);
        let mut texts = Vec::new();
        for prep in [Prep::Color, Prep::Text] {
            let (t, _) = ocr.region(img, x as u32, y as u32, cw as u32, ch as u32, 2.0, prep)?;
            texts.push(t);
        }
        cards.push(Card { x, y, w: cw, h: ch, texts });
    }
    if !names.is_empty() {
        let real = cards.iter().filter(|c| c.texts.iter().any(|t| like_reward(t, names))).count();
        if real == 0 || real * 2 < cards.len() {
            return Ok(None);
        }
    }
    Ok(Some(cards))
}

// Lowercase, ё→е, letters and digits only (same as the app's matcher).
fn compact(s: &str) -> String {
    s.to_lowercase().replace('ё', "е").chars().filter(|c| c.is_alphanumeric()).collect()
}

// OCR text close enough to some reward name: similarity ≥ 0.5, or a long piece of a name
// (two-line names often come out as one half).
pub(crate) fn like_reward(text: &str, names: &[String]) -> bool {
    let t: Vec<char> = compact(text).chars().collect();
    if t.len() < 4 {
        return false;
    }
    names.iter().any(|n| {
        let n: Vec<char> = n.chars().collect();
        let d = lev(&t, &n) as f32;
        1.0 - d / t.len().max(n.len()) as f32 >= 0.5 || (t.len() >= 8 && contains(&n, &t))
    })
}

fn contains(hay: &[char], needle: &[char]) -> bool {
    hay.windows(needle.len()).any(|w| w == needle)
}

fn lev(a: &[char], b: &[char]) -> usize {
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for i in 1..=a.len() {
        let mut cur = vec![i; b.len() + 1];
        for j in 1..=b.len() {
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + usize::from(a[i - 1] != b[j - 1]));
        }
        prev = cur;
    }
    prev[b.len()]
}

// Smallest centered layout where every word sits inside a card and every card has text.
fn card_count(words: &[Word], cx: f32, step: f32) -> Option<usize> {
    (1..=4).find(|&n| {
        let centers: Vec<f32> = (0..n).map(|i| cx + (i as f32 - (n as f32 - 1.0) / 2.0) * step).collect();
        let mut used = vec![false; n];
        words.iter().all(|wd| {
            let (i, d) = centers
                .iter()
                .enumerate()
                .map(|(i, c)| (i, (wd.x - c).abs()))
                .fold((0, f32::MAX), |a, b| if b.1 < a.1 { b } else { a });
            used[i] = true;
            d <= step / 2.0
        }) && used.iter().all(|&u| u)
    })
}

#[cfg(test)]
mod tests {
    // Card recognition on every recorded reward-screen frame, for finding bad reads:
    // REWARD_DIR=<bench dir> cargo test --lib reward -- --ignored --nocapture
    #[test]
    #[ignore]
    fn frames_in_dir() {
        let root = std::path::PathBuf::from(std::env::var("REWARD_DIR").expect("REWARD_DIR"));
        let ocr = super::Ocr::new(&std::env::var("REWARD_LANG").unwrap_or("ru".into())).unwrap();
        let names = reward_names();
        let mut dirs: Vec<_> = walk(&root).into_iter().filter(|p| p.is_dir()).collect();
        dirs.sort();
        for dir in dirs {
            let mut files: Vec<_> = std::fs::read_dir(&dir).unwrap().flatten().map(|e| e.path())
                .filter(|p| p.extension().is_some_and(|e| e == "jpg" || e == "png") && !p.with_extension("png").exists() || p.extension().is_some_and(|e| e == "png"))
                .collect();
            files.sort();
            files.dedup_by(|a, b| a.file_stem() == b.file_stem());
            if files.is_empty() { continue; }
            println!("== {}", dir.display());
            for f in files {
                let img = image::open(&f).unwrap().to_rgba8();
                let r = super::read_cards(&ocr, &img, &names).unwrap();
                let desc = match r {
                    None => "-".to_string(),
                    Some(cards) => format!("{} | {}", cards.len(), cards.iter().map(|c| c.texts.join(" / ")).collect::<Vec<_>>().join(" || ")),
                };
                println!("{} {}", f.file_name().unwrap().to_string_lossy(), desc);
            }
        }
    }

    #[test]
    fn reward_text_check() {
        let names = reward_names();
        for junk in ["5", "Пауза 4", "ОЖИДАНИЕ ИГРОКОВ", "Выберите награду", "Загрузка...", "Продолжить: 3", "Нажмите ESC"] {
            assert!(!super::like_reward(junk, &names), "junk passed: {junk}");
        }
        // Real OCR reads from recorded screens.
        for real in ["Лавк-спур Прайм: Приёмник", "Бёрстон им: Приклад", "Аф нтис Прайм: Рукоять", "Чертёж: Вольнус Прайм", "Б эйтон Прайм: Приёмник", "дель Прайм: Каркас"] {
            assert!(super::like_reward(real, &names), "real rejected: {real}");
        }
    }

    // Card names of every relic reward, as the app sends them (see rewards.ts screenName).
    fn reward_names() -> Vec<String> {
        let db: serde_json::Value = serde_json::from_str(&std::fs::read_to_string("../static/data/ru/db.json").unwrap()).unwrap();
        let mut out = Vec::new();
        for r in db["relics"].as_object().unwrap().values() {
            for rw in r["rewards"].as_array().unwrap() {
                let it = &db["items"][rw["id"].as_str().unwrap()];
                if let Some(ru) = it["ru"].as_str() {
                    let name = if it["bp"].as_bool() == Some(true) { format!("Чертёж: {ru}") } else { ru.to_string() };
                    out.push(super::compact(&name));
                }
            }
        }
        out.sort();
        out.dedup();
        out
    }

    fn walk(p: &std::path::Path) -> Vec<std::path::PathBuf> {
        let mut out = vec![p.to_path_buf()];
        for e in std::fs::read_dir(p).into_iter().flatten().flatten() {
            if e.path().is_dir() { out.extend(walk(&e.path())); }
        }
        out
    }
}
