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
const SCAN_FOR: Duration = Duration::from_secs(6);
const SCAN_EVERY: Duration = Duration::from_millis(60);

#[derive(Default)]
pub struct Squad {
    relics: Vec<String>, // "T1VoidProjectionProteaPrimeAPlatinum", seen since the mission started
    scanning: bool,
    last_scan: Option<Instant>,
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
}

pub fn init() -> SquadState {
    Arc::new(Mutex::new(Squad::default()))
}

// Every EE.log line goes through here (called from the log tail in bench.rs).
pub fn on_line(app: &AppHandle, line: &str) {
    let Some(squad) = app.try_state::<SquadState>().map(|s| s.inner().clone()) else { return };
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
        if s.scanning || s.last_scan.is_some_and(|t| t.elapsed() < Duration::from_secs(20)) {
            return;
        }
        s.scanning = true;
        s.last_scan = Some(Instant::now());
    }
    let relics = squad.lock().unwrap().relics.clone();
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
                ScanFlags { app: app.clone(), relics },
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
}

struct Scanner {
    app: AppHandle,
    relics: Vec<String>,
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
            ocr: Ocr::new()?,
            start: Instant::now(),
            last: None,
            frames: 0,
            scratch: Vec::new(),
        })
    }

    fn on_frame_arrived(&mut self, frame: &mut Frame, control: InternalCaptureControl) -> Result<(), Self::Error> {
        if self.start.elapsed() > SCAN_FOR {
            let _ = self.app.emit("reward-error", "Не удалось прочитать названия наград за 6 с");
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
        if let Some(cards) = read_cards(&self.ocr, &img)? {
            let scan = Scan {
                cards,
                screen_w: w,
                screen_h: h,
                scale: h as f32 / 1080.0,
                ms: self.start.elapsed().as_millis() as u64,
                ocr_ms: t.elapsed().as_millis() as u64,
                frames: self.frames,
                relics: self.relics.clone(),
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
#[tauri::command]
pub fn reward_scan_file(path: String) -> Result<Option<Scan>, String> {
    let img = image::open(&path).map_err(|e| e.to_string())?.to_rgba8();
    let (w, h) = img.dimensions();
    let ocr = Ocr::new().map_err(|e| e.to_string())?;
    let t = Instant::now();
    let cards = read_cards(&ocr, &img).map_err(|e| e.to_string())?;
    Ok(cards.map(|cards| Scan {
        cards,
        screen_w: w,
        screen_h: h,
        scale: h as f32 / 1080.0,
        ms: 0,
        ocr_ms: t.elapsed().as_millis() as u64,
        frames: 1,
        relics: Vec::new(),
    }))
}

// Replays a saved frame through the whole path (recognition -> overlay), for testing without the game.
#[tauri::command]
pub fn reward_replay(app: AppHandle, path: String, relics: Vec<String>) -> Result<bool, String> {
    let Some(mut scan) = reward_scan_file(path)? else { return Ok(false) };
    scan.relics = relics;
    crate::overlay::show(&app);
    let _ = app.emit("reward-scan", scan);
    Ok(true)
}

// None = the names are not on screen yet (countdown, "Загрузка...", fade-in).
fn read_cards(ocr: &Ocr, img: &RgbaImage) -> windows::core::Result<Option<Vec<Card>>> {
    let (w, h) = img.dimensions();
    let s = h as f32 / 1080.0;
    let cx = w as f32 / 2.0;
    let step = CARD_STEP * s;

    // 1. The whole strip once: is there text, and how many cards (1..4, centered)?
    let (x0, y0) = (cx - 2.0 * step, TEXT_Y * s);
    let (text, words) = ocr.region(img, x0 as u32, y0 as u32, (4.0 * step) as u32, (TEXT_H * s) as u32, 1.0, Prep::Color)?;
    if words.is_empty() || text.to_lowercase().contains("загрузка") {
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
    Ok(Some(cards))
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
