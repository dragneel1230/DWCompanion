// Ducat kiosk hints: EE.log says the "Selling Prime Parts" screen opened -> capture the game window
// (Windows Graphics Capture), OCR the part names in the grid and the picked list on the right, send
// them to the overlay window, which matches them and draws small hints over the tiles. Nothing is
// sent to the game. The log has no line for closing the kiosk, so it is seen on screen: no part names
// and no "Prime parts" title for a couple of looks.
//
// Layout measured on 1920x1080 frames (ru client), scaled by height: tiles 190 px wide, 207.6 px
// apart from x 75, rows 222 px apart; names at the bottom of a tile; picked list x 1370..1815.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use image::RgbaImage;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
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
const OPEN_LINE: &str = "InventoryTest - CurrMode: Selling Prime Parts";
const MODE_LINE: &str = "InventoryTest - CurrMode:";
const LOOK_EVERY: Duration = Duration::from_millis(200);
const MAX_RUN: Duration = Duration::from_secs(30 * 60);
// Mean gray difference (0..255) of sampled pixels, as in inventory.rs.
const STILL: f32 = 1.2;
const GRID_CHANGED: f32 = 2.0;
const SIDE_CHANGED: f32 = 0.8;
const GONE_AFTER: u32 = 2; // looks without the kiosk on screen before the hints hide
// Hidden (a sell dialog over the grid, or the kiosk closed): look rarely, give up after a while.
const HIDDEN_LOOK: Duration = Duration::from_millis(1500);
const GIVE_UP: Duration = Duration::from_secs(45);

// Regions in 1080p units: x, y, w, h (x from the 16:9 area's left edge).
const GRID: [f32; 4] = [70.0, 188.0, 1240.0, 800.0];
const SIDE: [f32; 4] = [1370.0, 205.0, 445.0, 625.0];
const TITLE: [f32; 4] = [88.0, 106.0, 320.0, 40.0];

type Control = CaptureControl<KioskScanner, Box<dyn std::error::Error + Send + Sync>>;

#[derive(Default)]
pub struct Kiosk {
    enabled: bool,
    control: Option<Control>,
}

pub type KioskState = Arc<Mutex<Kiosk>>;

pub fn init() -> KioskState {
    Arc::new(Mutex::new(Kiosk { enabled: true, control: None }))
}

#[derive(Clone, Serialize)]
pub struct KioskFrame {
    pub grid: Vec<Line>, // name lines in the tile grid, frame pixels
    pub side: Vec<Line>, // the picked list on the right
    pub badges: Vec<(f32, f32)>, // "✓ N" copy-count badges (top left of a tile), frame pixels
    pub w: u32,
    pub h: u32,
    pub ox: f32, // left edge of the 16:9 area in the frame
    pub left: i32, // game window position on screen (overlay = primary monitor at 0,0)
    pub top: i32,
    pub ocr_ms: u64,
}

// Every EE.log line (bench.rs).
pub fn on_line(app: &AppHandle, line: &str) {
    if line.contains(OPEN_LINE) {
        start(app);
    } else if line.contains(MODE_LINE) {
        stop(app); // another inventory screen
    } else if line.contains("Sys [Info]: WM_ACTIVATEAPP 0") {
        let _ = app.emit_to("overlay", "kiosk-focus", false);
    } else if line.contains("Sys [Info]: WM_ACTIVATEAPP 1") {
        let _ = app.emit_to("overlay", "kiosk-focus", true);
    }
}

fn start(app: &AppHandle) {
    let Some(state) = app.try_state::<KioskState>().map(|s| s.inner().clone()) else { return };
    let mut k = state.lock().unwrap();
    if !k.enabled {
        return;
    }
    if let Some(old) = k.control.take() {
        let _ = old.stop();
    }
    let names = app.try_state::<crate::reward::SquadState>().map(|s| s.lock().unwrap().names.clone()).unwrap_or_default();
    let lang = app.try_state::<crate::reward::SquadState>().map(|s| s.lock().unwrap().lang.clone()).unwrap_or("ru".into());
    let result = (|| -> Result<Control, String> {
        let window = Window::from_name(GAME_TITLE).map_err(|_| "rust.noGameWindow".to_string())?;
        let rect = window.rect().ok();
        let settings = Settings::new(
            window,
            CursorCaptureSettings::WithoutCursor,
            DrawBorderSettings::WithoutBorder,
            SecondaryWindowSettings::Default,
            MinimumUpdateIntervalSettings::Custom(Duration::from_millis(50)),
            DirtyRegionSettings::Default,
            ColorFormat::Rgba8,
            Flags { app: app.clone(), names, lang, left: rect.map_or(0, |r| r.left), top: rect.map_or(0, |r| r.top) },
        );
        KioskScanner::start_free_threaded(settings).map_err(|e| e.to_string())
    })();
    match result {
        Ok(c) => {
            k.control = Some(c);
            let _ = app.emit_to("overlay", "kiosk-open", ());
        }
        Err(e) => eprintln!("kiosk capture: {e}"),
    }
}

pub fn stop(app: &AppHandle) {
    let Some(state) = app.try_state::<KioskState>() else { return };
    let control = state.lock().unwrap().control.take();
    if let Some(c) = control {
        let _ = c.stop();
        let _ = app.emit_to("overlay", "kiosk-close", ());
        crate::overlay::hide(app);
    }
}

// Switched on / off in the app's overlay settings.
#[tauri::command]
pub fn kiosk_config(app: AppHandle, enabled: bool) {
    if let Some(state) = app.try_state::<KioskState>() {
        state.lock().unwrap().enabled = enabled;
    }
    if !enabled {
        stop(&app);
    }
}

// Runs a saved screenshot through the whole path (recognition -> overlay), for testing without the game.
#[tauri::command]
pub fn kiosk_replay(app: AppHandle, path: String, lang: Option<String>) -> Result<KioskFrame, String> {
    let img = image::open(&path).map_err(|e| e.to_string())?.to_rgba8();
    let lang = lang.unwrap_or_else(|| "ru".into());
    let ocr = Ocr::new(&lang).map_err(|e| format!("rust.ocrMissing|{lang} ({e})"))?;
    let t = Instant::now();
    let r = read(&ocr, &img).map_err(|e| e.to_string())?;
    let (w, h) = img.dimensions();
    let frame = KioskFrame { grid: r.grid, side: r.side, badges: r.badges, w, h, ox: area_left(w, h), left: 0, top: 0, ocr_ms: t.elapsed().as_millis() as u64 };
    crate::overlay::show(&app);
    let _ = app.emit_to("overlay", "kiosk-frame", frame.clone());
    Ok(frame)
}

pub struct Flags {
    app: AppHandle,
    names: Vec<String>,
    lang: String,
    left: i32,
    top: i32,
}

pub struct KioskScanner {
    app: AppHandle,
    names: Vec<String>,
    ocr: Ocr,
    left: i32,
    top: i32,
    start: Instant,
    last_look: Option<Instant>,
    prev: (Vec<u8>, Vec<u8>), // sampled gray pixels of grid and side, previous look
    done: (Vec<u8>, Vec<u8>), // ... of the last recognized frame
    moving: bool,
    gone: u32,
    shown: bool,
    hidden_since: Option<Instant>,
    scratch: Vec<u8>,
}

impl GraphicsCaptureApiHandler for KioskScanner {
    type Flags = Flags;
    type Error = Box<dyn std::error::Error + Send + Sync>;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        let f = ctx.flags;
        Ok(Self {
            ocr: Ocr::new(&f.lang).map_err(|e| format!("rust.ocrMissing|{} ({e})", f.lang))?,
            app: f.app,
            names: f.names,
            left: f.left,
            top: f.top,
            start: Instant::now(),
            last_look: None,
            prev: Default::default(),
            done: Default::default(),
            moving: false,
            gone: 0,
            shown: false,
            hidden_since: None,
            scratch: Vec::new(),
        })
    }

    fn on_frame_arrived(&mut self, frame: &mut Frame, control: InternalCaptureControl) -> Result<(), Self::Error> {
        if self.start.elapsed() > MAX_RUN {
            self.close(control);
            return Ok(());
        }
        if self.hidden_since.is_some_and(|t| t.elapsed() > GIVE_UP) {
            self.close(control);
            return Ok(());
        }
        let every = if self.hidden_since.is_some() { HIDDEN_LOOK } else { LOOK_EVERY };
        if self.last_look.is_some_and(|t| t.elapsed() < every) {
            return Ok(());
        }
        self.last_look = Some(Instant::now());

        let (w, h) = (frame.width(), frame.height());
        let fb = frame.buffer()?;
        let pixels = fb.as_nopadding_buffer(&mut self.scratch);
        let ox = area_left(w, h);
        let s = h as f32 / 1080.0;
        let grid = signature(pixels, w, h, region(GRID, s, ox));
        let side = signature(pixels, w, h, region(SIDE, s, ox));

        let settled = same_len(&self.prev.0, &grid) && diff(&self.prev.0, &grid) < STILL && diff(&self.prev.1, &side) < STILL;
        let grid_new = !same_len(&self.done.0, &grid) || diff(&self.done.0, &grid) > GRID_CHANGED;
        let side_new = !same_len(&self.done.1, &side) || diff(&self.done.1, &side) > SIDE_CHANGED;
        self.prev = (grid, side);
        // Scrolling: hide the hints until the grid settles (they would sit on the wrong tiles).
        if grid_new && !settled && !self.moving && self.shown {
            self.moving = true;
            let _ = self.app.emit_to("overlay", "kiosk-moving", ());
        }
        if !settled || !(grid_new || side_new) {
            return Ok(());
        }
        self.done = self.prev.clone();
        self.moving = false;

        let Some(img) = RgbaImage::from_raw(w, h, pixels.to_vec()) else { return Ok(()) };
        let t = Instant::now();
        let r = read(&self.ocr, &img)?;
        let present = r.title || r.grid.iter().any(|l| crate::reward::like_reward(&l.text, &self.names));
        if !present {
            self.gone += 1;
            self.done = Default::default(); // look again next time
            if self.gone >= GONE_AFTER && self.hidden_since.is_none() {
                self.hidden_since = Some(Instant::now());
                self.shown = false;
                let _ = self.app.emit_to("overlay", "kiosk-close", ());
                crate::overlay::hide(&self.app);
            }
            return Ok(());
        }
        self.gone = 0;
        self.hidden_since = None;
        let frame = KioskFrame { grid: r.grid, side: r.side, badges: r.badges, w, h, ox, left: self.left, top: self.top, ocr_ms: t.elapsed().as_millis() as u64 };
        if !self.shown {
            self.shown = true;
            crate::overlay::show(&self.app);
        }
        let _ = self.app.emit_to("overlay", "kiosk-frame", frame);
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        let _ = self.app.emit_to("overlay", "kiosk-close", ());
        crate::overlay::hide(&self.app);
        Ok(())
    }
}

impl KioskScanner {
    fn close(&mut self, control: InternalCaptureControl) {
        let _ = self.app.emit_to("overlay", "kiosk-close", ());
        crate::overlay::hide(&self.app);
        if let Some(state) = self.app.try_state::<KioskState>() {
            state.lock().unwrap().control = None;
        }
        control.stop();
    }
}

struct Read {
    grid: Vec<Line>,
    badges: Vec<(f32, f32)>,
    side: Vec<Line>,
    title: bool, // "Прайм части" / "Prime parts" over the grid
}

fn read(ocr: &Ocr, img: &RgbaImage) -> windows::core::Result<Read> {
    let (w, h) = img.dimensions();
    let s = h as f32 / 1080.0;
    let ox = area_left(w, h);
    let lines = |r: [f32; 4], prep: Prep| -> windows::core::Result<Vec<Line>> {
        let [x, y, rw, rh] = region(r, s, ox);
        // Upscaled for the small tile text, within what the engine accepts.
        let scale = (1.6 / s).min(Ocr::max_side() as f32 / rw.max(rh) as f32 * 0.98).max(1.0);
        ocr.lines(img, x, y, rw, rh, scale, prep)
    };
    // Tile names are pale gold over busy art: the gold-text pass reads them best (2026-10-02 shots:
    // 39 lines, 7 of 18 tiles mangled by the colour pass come out clean); the colour pass is a second
    // reading of each tile for the matcher.
    let mut grid = lines(GRID, Prep::Beige)?;
    for mut l in lines(GRID, Prep::Color)? {
        l.pass = 1;
        grid.push(l);
    }
    let side = lines(SIDE, Prep::Color)?;
    let title = lines(TITLE, Prep::Color)?.iter().any(|l| {
        let t = l.text.to_lowercase();
        t.contains("прайм") || t.contains("prime")
    });
    Ok(Read { grid, side, title, badges: badges(img) })
}

// Copy-count badges: a pale gold check in a circle on a dark plate, in a tile's top left corner (the
// game shows it only for 2+ copies). OCR can't read the lone digit; the badge itself is enough.
// Scans each column's corner strip down the grid; box 22x22 at 1080p.
fn badges(img: &RgbaImage) -> Vec<(f32, f32)> {
    let (w, h) = img.dimensions();
    let s = h as f32 / 1080.0;
    let ox = area_left(w, h);
    let size = (22.0 * s).round() as u32;
    let mut out: Vec<(f32, f32)> = Vec::new();
    for col in 0..6 {
        let x = (ox + (75.0 + col as f32 * 207.6 + 7.0) * s) as u32;
        let mut y = (GRID[1] * s) as u32;
        let end = ((GRID[1] + GRID[3]) * s) as u32;
        while y + size < end.min(h) {
            let (mut gold, mut dark, mut n) = (0u32, 0u32, 0u32);
            for yy in y..y + size {
                for xx in x..(x + size).min(w) {
                    let [r, g, b, _] = img.get_pixel(xx, yy).0;
                    let (r, g, b) = (r as i32, g as i32, b as i32);
                    if r > 120 && g > 105 && (r - g).abs() < 35 && b * 100 > r * 45 && b * 100 < r * 85 {
                        gold += 1;
                    }
                    if r.max(g).max(b) < 50 {
                        dark += 1;
                    }
                    n += 1;
                }
            }
            let (gold, dark) = (gold as f32 / n as f32, dark as f32 / n as f32);
            if (0.12..0.45).contains(&gold) && dark > 0.4 {
                if !out.iter().any(|&(bx, by)| (bx - x as f32).abs() < 1.0 && (by - y as f32).abs() < 30.0 * s) {
                    out.push((x as f32, y as f32));
                }
                y += (30.0 * s) as u32;
            } else {
                y += 2;
            }
        }
    }
    out
}

// Left edge of the 16:9 area: wider screens keep the menus in the middle.
fn area_left(w: u32, h: u32) -> f32 {
    ((w as f32 - h as f32 * 16.0 / 9.0) / 2.0).max(0.0)
}

fn region(r: [f32; 4], s: f32, ox: f32) -> [u32; 4] {
    [(ox + r[0] * s) as u32, (r[1] * s) as u32, (r[2] * s) as u32, (r[3] * s) as u32]
}

// Every 6th pixel of every 6th row of a region, as gray.
fn signature(px: &[u8], w: u32, h: u32, [x0, y0, rw, rh]: [u32; 4]) -> Vec<u8> {
    let mut out = Vec::new();
    for y in (y0..(y0 + rh).min(h)).step_by(6) {
        for x in (x0..(x0 + rw).min(w)).step_by(6) {
            let i = ((y * w + x) * 4) as usize;
            out.push(((px[i] as u32 + px[i + 1] as u32 + px[i + 2] as u32) / 3) as u8);
        }
    }
    out
}

fn same_len(a: &[u8], b: &[u8]) -> bool {
    !a.is_empty() && a.len() == b.len()
}

fn diff(a: &[u8], b: &[u8]) -> f32 {
    if a.len() != b.len() {
        return f32::MAX;
    }
    let sum: u64 = a.iter().zip(b).map(|(x, y)| x.abs_diff(*y) as u64).sum();
    sum as f32 / a.len().max(1) as f32
}

#[cfg(test)]
mod tests {
    // OCR of a saved kiosk screenshot, for tuning without the game:
    // KIOSK_PNG=shot.jpg cargo test --lib kiosk -- --ignored --nocapture
    #[test]
    #[ignore]
    fn read_png() {
        let path = std::env::var("KIOSK_PNG").expect("KIOSK_PNG");
        let img = image::open(path).unwrap().to_rgba8();
        let ocr = super::Ocr::new("ru").unwrap();
        let t = std::time::Instant::now();
        let r = super::read(&ocr, &img).unwrap();
        eprintln!("ocr {} ms, title {}", t.elapsed().as_millis(), r.title);
        for l in &r.grid {
            println!("G{} {:>6.0} {:>6.0} {:>5.0} {:>4.0}  {}", l.pass, l.x, l.y, l.w, l.h, l.text);
        }
        println!("badges {:?}", r.badges);
        for l in &r.side {
            println!("S  {:>6.0} {:>6.0} {:>5.0} {:>4.0}  {}", l.x, l.y, l.w, l.h, l.text);
        }
    }
}


