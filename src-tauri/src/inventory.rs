// Mod inventory scan: while the user scrolls the in-game Mods screen by hand, capture the game
// window (Windows Graphics Capture), OCR every settled frame and send the text lines to the app,
// which matches them to mod names. Frames stay in memory; nothing is written to disk and nothing
// is sent to the game (no input, no scrolling for the user).

use std::sync::Mutex;
use std::time::{Duration, Instant};

use image::RgbaImage;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use windows_capture::capture::{CaptureControl, Context, GraphicsCaptureApiHandler};
use windows_capture::frame::Frame;
use windows_capture::graphics_capture_api::InternalCaptureControl;
use windows_capture::settings::{
    ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings, MinimumUpdateIntervalSettings,
    SecondaryWindowSettings, Settings,
};
use windows_capture::window::Window;

use crate::ocr::{Line, Ocr, Prep};

const GAME_TITLE: &str = "Warframe";
const LOOK_EVERY: Duration = Duration::from_millis(150);
const MAX_RUN: Duration = Duration::from_secs(30 * 60);
// Mean gray difference (0..255) of sampled pixels: below STILL the picture has settled after
// scrolling; above CHANGED it differs from the last recognized one.
const STILL: f32 = 1.5;
const CHANGED: f32 = 2.5;

type Control = CaptureControl<InvScanner, Box<dyn std::error::Error + Send + Sync>>;

#[derive(Default)]
pub struct InvState(Mutex<Option<Control>>);

#[derive(Clone, Serialize)]
pub struct InvFrame {
    pub lines: Vec<Line>,
    pub w: u32,
    pub h: u32,
    pub ocr_ms: u64,
}

#[tauri::command]
pub fn inv_scan_start(app: AppHandle, state: tauri::State<InvState>) -> Result<(), String> {
    let mut slot = state.0.lock().unwrap();
    if let Some(old) = slot.take() {
        let _ = old.stop();
    }
    let window = Window::from_name(GAME_TITLE).map_err(|_| "Окно Warframe не найдено: запусти игру".to_string())?;
    let settings = Settings::new(
        window,
        CursorCaptureSettings::WithoutCursor,
        DrawBorderSettings::WithoutBorder,
        SecondaryWindowSettings::Default,
        MinimumUpdateIntervalSettings::Custom(Duration::from_millis(50)),
        DirtyRegionSettings::Default,
        ColorFormat::Rgba8,
        app.clone(),
    );
    let control = InvScanner::start_free_threaded(settings).map_err(|e| e.to_string())?;
    *slot = Some(control);
    Ok(())
}

#[tauri::command]
pub fn inv_scan_stop(state: tauri::State<InvState>) {
    if let Some(control) = state.0.lock().unwrap().take() {
        let _ = control.stop();
    }
}

pub fn init() -> InvState {
    InvState::default()
}

pub struct InvScanner {
    app: AppHandle,
    ocr: Ocr,
    start: Instant,
    last_look: Option<Instant>,
    prev: Vec<u8>, // sampled gray pixels of the previous look
    done: Vec<u8>, // ... of the last recognized frame
    scratch: Vec<u8>,
}

impl GraphicsCaptureApiHandler for InvScanner {
    type Flags = AppHandle;
    type Error = Box<dyn std::error::Error + Send + Sync>;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        Ok(Self {
            app: ctx.flags,
            ocr: Ocr::new()?,
            start: Instant::now(),
            last_look: None,
            prev: Vec::new(),
            done: Vec::new(),
            scratch: Vec::new(),
        })
    }

    fn on_frame_arrived(&mut self, frame: &mut Frame, control: InternalCaptureControl) -> Result<(), Self::Error> {
        if self.start.elapsed() > MAX_RUN {
            let _ = self.app.emit("inv-stopped", "Сканирование остановлено: прошло 30 минут");
            control.stop();
            return Ok(());
        }
        if self.last_look.is_some_and(|t| t.elapsed() < LOOK_EVERY) {
            return Ok(());
        }
        self.last_look = Some(Instant::now());

        let (w, h) = (frame.width(), frame.height());
        let fb = frame.buffer()?;
        let pixels = fb.as_nopadding_buffer(&mut self.scratch);
        let sig = signature(pixels, w, h);
        // Recognize once the list stops moving, and only if it shows something new.
        let settled = self.prev.len() == sig.len() && diff(&self.prev, &sig) < STILL;
        let new = self.done.len() != sig.len() || diff(&self.done, &sig) > CHANGED;
        self.prev = sig;
        if !settled || !new {
            return Ok(());
        }
        self.done = self.prev.clone();

        let Some(img) = RgbaImage::from_raw(w, h, pixels.to_vec()) else { return Ok(()) };
        let t = Instant::now();
        let lines = read_lines(&self.ocr, &img)?;
        let _ = self.app.emit("inv-frame", InvFrame { lines, w, h, ocr_ms: t.elapsed().as_millis() as u64 });
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        let _ = self.app.emit("inv-stopped", "Окно игры закрыто");
        Ok(())
    }
}

// Every 8th pixel of every 8th row, as gray.
fn signature(px: &[u8], w: u32, h: u32) -> Vec<u8> {
    let mut out = Vec::with_capacity(((w / 8) * (h / 8)) as usize);
    for y in (0..h).step_by(8) {
        for x in (0..w).step_by(8) {
            let i = ((y * w + x) * 4) as usize;
            out.push(((px[i] as u32 + px[i + 1] as u32 + px[i + 2] as u32) / 3) as u8);
        }
    }
    out
}

fn diff(a: &[u8], b: &[u8]) -> f32 {
    let sum: u64 = a.iter().zip(b).map(|(x, y)| x.abs_diff(*y) as u64).sum();
    sum as f32 / a.len().max(1) as f32
}

// Whole frame, upscaled so small card text reads well, cut into overlapping tiles the OCR engine
// accepts. Lines seen twice in an overlap are dropped.
fn read_lines(ocr: &Ocr, img: &RgbaImage) -> windows::core::Result<Vec<Line>> {
    let (w, h) = img.dimensions();
    let scale = (1800.0 / h as f32).clamp(1.0, 2.0);
    let side = ((Ocr::max_side() as f32 / scale) as u32).saturating_sub(8).max(256);
    let overlap = (120.0 * h as f32 / 1080.0) as u32;
    let starts = |len: u32| -> Vec<u32> {
        if len <= side {
            return vec![0];
        }
        let mut v = Vec::new();
        let mut p = 0;
        while p + side < len {
            v.push(p);
            p += side - overlap;
        }
        v.push(len - side);
        v
    };
    let mut out: Vec<Line> = Vec::new();
    for ty in starts(h) {
        for tx in starts(w) {
            // Two passes: colors as they are, and white text only (card names over busy art).
            for (pass, prep) in [(0, Prep::Color), (1, Prep::White)] {
                for mut line in ocr.lines(img, tx, ty, side.min(w), side.min(h), scale, prep)? {
                    line.pass = pass;
                    let dup = out.iter().any(|o| o.pass == pass && o.text == line.text && (o.x - line.x).abs() < 8.0 && (o.y - line.y).abs() < 8.0);
                    if !dup {
                        out.push(line);
                    }
                }
            }
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    // OCR of a saved screenshot, for tuning without the game:
    // INV_PNG=shot.png cargo test --lib inventory -- --ignored --nocapture
    #[test]
    #[ignore]
    fn lines_from_png() {
        let path = std::env::var("INV_PNG").expect("INV_PNG");
        let src = image::open(path).unwrap().to_rgba8();
        // Crops are placed on a 1920x1080 canvas so the upscale matches a real frame.
        let mut img = image::RgbaImage::new(1920.max(src.width()), 1080.max(src.height()));
        image::imageops::overlay(&mut img, &src, 0, 0);
        let ocr = super::Ocr::new().unwrap();
        let t = std::time::Instant::now();
        let lines = super::read_lines(&ocr, &img).unwrap();
        eprintln!("ocr {} ms", t.elapsed().as_millis());
        println!("JSON{}", serde_json::to_string(&lines).unwrap());
    }
}
