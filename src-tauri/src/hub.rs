// Hub: the full overlay opened by a hotkey over the game (search, market, fissures, mission).
// A separate top-most window, like the reward overlay: nothing is injected into the game.
// Open: remember the foreground window, cover the game's monitor, take focus; the blurred frame of the
// game (background) comes right after. Close (Esc / hotkey): hide and give focus back.

use std::sync::mpsc::{sync_channel, SyncSender};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, IsWindow, SetForegroundWindow};
use windows_capture::capture::{Context, GraphicsCaptureApiHandler};
use windows_capture::frame::Frame;
use windows_capture::graphics_capture_api::InternalCaptureControl;
use windows_capture::monitor::Monitor;
use windows_capture::settings::{
    ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings, GraphicsCaptureItemType,
    MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
};
use windows_capture::window::Window;

const LABEL: &str = "hub";
const GAME_TITLE: &str = "Warframe";
pub const DEFAULT_SHORTCUT: &str = "Alt+X";
// Background frame: tiny and pre-blurred here, the page only stretches it (a CSS blur filter on a
// full-screen layer cost ~60 ms before the first visible frame, measured with hub_bench).
const BG_WIDTH: u32 = 192;
const BG_BLUR: f32 = 2.5; // sigma in BG_WIDTH pixels: ~25 screen pixels at 1080p
const SNAP_TIMEOUT: Duration = Duration::from_millis(300);

#[derive(Default)]
pub struct Hub {
    prev: Mutex<isize>, // foreground window before opening (HWND as isize: HWND is not Send)
    shortcut: Mutex<Option<Shortcut>>,
    opened: Mutex<Option<Instant>>,
    busy: Mutex<bool>,
    seq: Mutex<u32>,                   // open counter: a late background frame of an earlier open is dropped
    area: Mutex<Option<RECT>>,         // where the window was put last time (move/resize only on change)
    timing: Mutex<Timing>,
    game_title: Mutex<Option<String>>, // bench: another window stands in for the game
}

// The system blur of the window itself (DWM acrylic / blur-behind) was tried instead of the frame:
// it shows ~120 ms sooner, but with a moving picture behind it DWM took +30..38 % of the GPU
// (hub_bench, 2026-10-02): an FPS drop in the game while the hub is open. Not used.

// Times of the last open, from the hotkey.
#[derive(Clone, Default, Serialize)]
pub struct Timing {
    #[serde(skip)]
    t0: Option<Instant>,
    snap_ms: f64,  // background frame ready (after the show when the game window is captured)
    show_ms: f64,  // window shown
    paint_ms: f64, // the page drew its first frame (reported by the page)
}

#[derive(Clone, Serialize)]
struct Opened {
    seq: u32,
    bg: Option<String>, // PNG data URL of the blurred frame; None = comes later as "hub-bg"
    game: bool,         // the Warframe window was found
}

#[derive(Clone, Serialize)]
struct Bg {
    seq: u32,
    bg: String,
}

fn ms(t: Instant) -> f64 {
    t.elapsed().as_secs_f64() * 1000.0
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let win = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("hub".into()))
        .title("DWCompanion")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false)
        .build()?;
    // Alt+Tab away from the hub = back to playing: hide it.
    let handle = app.clone();
    win.on_window_event(move |e| {
        if let WindowEvent::Focused(false) = e {
            let hub = handle.state::<Hub>();
            let fresh = hub.opened.lock().unwrap().is_some_and(|t| t.elapsed() < Duration::from_millis(400));
            if !fresh {
                hide(&handle, false);
            }
        }
    });
    Ok(())
}

pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                toggle(app);
            }
        })
        .build()
}

pub fn set_shortcut(app: &AppHandle, accel: &str) -> Result<(), String> {
    let new: Shortcut = accel.parse().map_err(|_| format!("rust.keysParse|{accel}"))?;
    let hub = app.state::<Hub>();
    let mut cur = hub.shortcut.lock().unwrap();
    if *cur == Some(new) {
        return Ok(());
    }
    let gs = app.global_shortcut();
    if let Some(old) = cur.take() {
        let _ = gs.unregister(old);
    }
    match gs.register(new) {
        Ok(()) => {
            *cur = Some(new);
            Ok(())
        }
        Err(e) => {
            // Keep the hub reachable: fall back to the default.
            if let Ok(d) = DEFAULT_SHORTCUT.parse::<Shortcut>() {
                if gs.register(d).is_ok() {
                    *cur = Some(d);
                }
            }
            Err(format!("rust.keysTaken|{e}"))
        }
    }
}

fn visible(app: &AppHandle) -> bool {
    app.get_webview_window(LABEL).and_then(|w| w.is_visible().ok()).unwrap_or(false)
}

pub fn toggle(app: &AppHandle) {
    if visible(app) {
        hide(app, true);
    } else {
        open(app);
    }
}

fn open(app: &AppHandle) {
    let hub = app.state::<Hub>();
    {
        let mut busy = hub.busy.lock().unwrap();
        if *busy {
            return;
        }
        *busy = true;
    }
    *hub.prev.lock().unwrap() = unsafe { GetForegroundWindow() }.0 as isize;
    let t0 = Instant::now();
    *hub.timing.lock().unwrap() = Timing { t0: Some(t0), ..Default::default() };
    let seq = {
        let mut s = hub.seq.lock().unwrap();
        *s += 1;
        *s
    };

    let app = app.clone();
    thread::spawn(move || {
        let stand_in = app.state::<Hub>().game_title.lock().unwrap().clone();
        let game = match stand_in {
            Some(t) => Window::from_contains_name(&t).ok(),
            None => Window::from_name(GAME_TITLE).ok(),
        };
        let area = game.and_then(|w| monitor_rect(HWND(w.as_raw_hwnd())));
        let shown = |bg: Option<String>| {
            let a = app.clone();
            let _ = app.run_on_main_thread(move || {
                show(&a, area, Opened { seq, bg, game: game.is_some() });
                let hub = a.state::<Hub>();
                let mut tm = hub.timing.lock().unwrap();
                if let Some(t) = tm.t0 {
                    tm.show_ms = ms(t);
                }
                drop(tm);
                *hub.busy.lock().unwrap() = false;
            });
        };
        let snapped = || app.state::<Hub>().timing.lock().unwrap().snap_ms = ms(t0);
        match game {
            // Window capture never sees our own windows: show at once, the frame follows.
            Some(w) => {
                shown(None);
                if let Some(bg) = snapshot(Some(w)) {
                    snapped();
                    let _ = app.emit_to(LABEL, "hub-bg", Bg { seq, bg });
                }
            }
            // Monitor capture would see the hub itself: the frame first.
            None => {
                let bg = snapshot(None);
                snapped();
                shown(bg);
            }
        }
    });
}

fn show(app: &AppHandle, area: Option<RECT>, opened: Opened) {
    let Some(win) = app.get_webview_window(LABEL) else { return };
    // Cover the game's monitor (primary when the game is not running).
    let rect = area.or_else(|| {
        win.primary_monitor().ok().flatten().map(|m| RECT {
            left: m.position().x,
            top: m.position().y,
            right: m.position().x + m.size().width as i32,
            bottom: m.position().y + m.size().height as i32,
        })
    });
    if let Some(r) = rect {
        let hub = app.state::<Hub>();
        let mut last = hub.area.lock().unwrap();
        let key = |r: &RECT| (r.left, r.top, r.right, r.bottom);
        if last.as_ref().map(key) != Some(key(&r)) {
            let _ = win.set_position(PhysicalPosition::new(r.left, r.top));
            let _ = win.set_size(PhysicalSize::new((r.right - r.left) as u32, (r.bottom - r.top) as u32));
            *last = Some(r);
        }
    }
    let _ = app.emit_to(LABEL, "hub-open", opened);
    let _ = app.emit_to("overlay", "hub-shown", true); // kiosk hints step aside
    *app.state::<Hub>().opened.lock().unwrap() = Some(Instant::now());
    let _ = win.show();
    let _ = win.set_focus();
}

pub fn hide(app: &AppHandle, restore_focus: bool) {
    let Some(win) = app.get_webview_window(LABEL) else { return };
    if !win.is_visible().unwrap_or(false) {
        return;
    }
    let _ = app.emit_to(LABEL, "hub-close", ());
    let _ = app.emit_to("overlay", "hub-shown", false);
    let _ = win.hide();
    if restore_focus {
        let prev = HWND(*app.state::<Hub>().prev.lock().unwrap() as *mut _);
        unsafe {
            if !prev.is_invalid() && IsWindow(Some(prev)).as_bool() {
                let _ = SetForegroundWindow(prev);
            }
        }
    }
}

fn monitor_rect(hwnd: HWND) -> Option<RECT> {
    unsafe {
        let m = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        GetMonitorInfoW(m, &mut info).as_bool().then_some(info.rcMonitor)
    }
}

// ---------- one frame of the game

struct Snap {
    tx: SyncSender<image::RgbaImage>,
}

impl GraphicsCaptureApiHandler for Snap {
    type Flags = SyncSender<image::RgbaImage>;
    type Error = Box<dyn std::error::Error + Send + Sync>;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        Ok(Self { tx: ctx.flags })
    }

    // Shrinks straight from the mapped frame (4x4 samples per output pixel): no copy of the full frame.
    fn on_frame_arrived(&mut self, frame: &mut Frame, control: InternalCaptureControl) -> Result<(), Self::Error> {
        let mut fb = frame.buffer()?;
        let (w, h, pitch) = (fb.width() as usize, fb.height() as usize, fb.row_pitch() as usize);
        if w == 0 || h == 0 {
            return Ok(());
        }
        let ow = BG_WIDTH as usize;
        let oh = (h * ow / w).max(1);
        let raw = fb.as_raw_buffer();
        let mut out = image::RgbaImage::new(ow as u32, oh as u32);
        for (ox, oy, px) in out.enumerate_pixels_mut() {
            let mut acc = [0u32; 3];
            for sy in 0..4 {
                let y = ((oy as usize * 4 + sy) * 2 + 1) * h / (oh * 8);
                for sx in 0..4 {
                    let x = ((ox as usize * 4 + sx) * 2 + 1) * w / (ow * 8);
                    let p = y * pitch + x * 4;
                    for (c, a) in acc.iter_mut().enumerate() {
                        *a += raw[p + c] as u32;
                    }
                }
            }
            *px = image::Rgba([(acc[0] / 16) as u8, (acc[1] / 16) as u8, (acc[2] / 16) as u8, 255]);
        }
        let _ = self.tx.try_send(out);
        control.stop();
        Ok(())
    }
}

// The game window when it runs (window capture never sees our own windows), else the primary monitor.
fn snapshot(game: Option<Window>) -> Option<String> {
    let (tx, rx) = sync_channel(1);
    let control = match game {
        Some(w) => Snap::start_free_threaded(settings(w, tx)).ok(),
        None => Snap::start_free_threaded(settings(Monitor::primary().ok()?, tx)).ok(),
    }?;
    let small = rx.recv_timeout(SNAP_TIMEOUT).ok();
    let _ = control.stop();
    let mut img = image::imageops::blur(&small?, BG_BLUR);
    // A little more color, as the old CSS saturate(1.15) did.
    for p in img.pixels_mut() {
        let [r, g, b, _] = p.0.map(|v| v as f32);
        let l = 0.299 * r + 0.587 * g + 0.114 * b;
        let f = |v: f32| (l + (v - l) * 1.15).clamp(0.0, 255.0) as u8;
        p.0 = [f(r), f(g), f(b), 255];
    }
    let mut png = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png).ok()?;
    Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png)))
}

fn settings<T: TryInto<GraphicsCaptureItemType>>(
    item: T,
    tx: SyncSender<image::RgbaImage>,
) -> Settings<SyncSender<image::RgbaImage>, T> {
    Settings::new(
        item,
        CursorCaptureSettings::WithoutCursor,
        DrawBorderSettings::WithoutBorder,
        SecondaryWindowSettings::Default,
        MinimumUpdateIntervalSettings::Default,
        DirtyRegionSettings::Default,
        ColorFormat::Rgba8,
        tx,
    )
}

// ---------- commands

// "Проверить" in the settings: the same as the hotkey.
#[tauri::command]
pub fn hub_toggle(app: AppHandle) {
    toggle(&app);
}

#[tauri::command]
pub fn hub_hide(app: AppHandle) {
    hide(&app, true);
}

#[tauri::command]
pub fn hub_set_shortcut(app: AppHandle, accel: String) -> Result<(), String> {
    set_shortcut(&app, &accel)
}

// "Открыть в приложении": hide the hub, bring up the main window on that page.
#[tauri::command]
pub fn hub_open_in_app(app: AppHandle, path: String) {
    hide(&app, false);
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
        let _ = app.emit_to("main", "navigate", path);
    }
}

// ---------- open timing (hub_bench: open/close without the game, measured on screen)

// The page reports its first drawn frame after "hub-open".
#[tauri::command]
pub fn hub_painted(hub: tauri::State<Hub>) {
    let mut tm = hub.timing.lock().unwrap();
    if let Some(t) = tm.t0 {
        if tm.paint_ms == 0.0 {
            tm.paint_ms = ms(t);
        }
    }
}

#[derive(Clone, Serialize)]
pub struct BenchRun {
    snap_ms: f64,
    show_ms: f64,
    paint_ms: f64,
    visible_ms: f64, // the screen first changed (the hub is on it)
    settled_ms: f64, // last frame that still changed (animations done)
}

// Watches the monitor: a grid of sampled pixels per frame, compared to the frame before opening.
struct Probe {
    tx: std::sync::mpsc::Sender<(Instant, Vec<u8>)>,
}

impl GraphicsCaptureApiHandler for Probe {
    type Flags = std::sync::mpsc::Sender<(Instant, Vec<u8>)>;
    type Error = Box<dyn std::error::Error + Send + Sync>;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        Ok(Self { tx: ctx.flags })
    }

    fn on_frame_arrived(&mut self, frame: &mut Frame, control: InternalCaptureControl) -> Result<(), Self::Error> {
        let at = Instant::now();
        let mut fb = frame.buffer()?;
        let (w, h, pitch) = (fb.width() as usize, fb.height() as usize, fb.row_pitch() as usize);
        let raw = fb.as_raw_buffer();
        let (gx, gy) = (64, 36);
        let mut grid = Vec::with_capacity(gx * gy);
        for j in 0..gy {
            let y = (j * 2 + 1) * h / (gy * 2);
            for i in 0..gx {
                let x = (i * 2 + 1) * w / (gx * 2);
                let p = y * pitch + x * 4;
                grid.push(((raw[p] as u32 + raw[p + 1] as u32 + raw[p + 2] as u32) / 3) as u8);
            }
        }
        if self.tx.send((at, grid)).is_err() {
            control.stop();
        }
        Ok(())
    }
}

fn diff(a: &[u8], b: &[u8]) -> f64 {
    a.iter().zip(b).map(|(x, y)| (*x as i32 - *y as i32).unsigned_abs() as f64).sum::<f64>() / a.len() as f64
}

fn bench_once(app: &AppHandle) -> Result<BenchRun, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let monitor = Monitor::primary().map_err(|e| e.to_string())?;
    let settings = Settings::new(
        monitor,
        CursorCaptureSettings::WithoutCursor,
        DrawBorderSettings::WithoutBorder,
        SecondaryWindowSettings::Default,
        MinimumUpdateIntervalSettings::Custom(Duration::from_millis(1)),
        DirtyRegionSettings::Default,
        ColorFormat::Bgra8,
        tx,
    );
    let control = Probe::start_free_threaded(settings).map_err(|e| e.to_string())?;
    // Baseline: the screen before opening (frames only come on changes, so take what arrives in 300 ms).
    let mut base = rx.recv_timeout(Duration::from_secs(2)).map_err(|_| "no frame from the monitor")?.1;
    while let Ok((_, g)) = rx.recv_timeout(Duration::from_millis(300)) {
        base = g;
    }
    let t0 = Instant::now();
    open(app);
    let mut frames = Vec::new();
    while t0.elapsed() < Duration::from_millis(1500) {
        if let Ok(f) = rx.recv_timeout(Duration::from_millis(50)) {
            frames.push(f);
        }
    }
    let _ = control.stop();
    let tm = app.state::<Hub>().timing.lock().unwrap().clone();
    let at = |t: Instant| t.saturating_duration_since(t0).as_secs_f64() * 1000.0;
    let visible = frames.iter().find(|(_, g)| diff(g, &base) > 3.0).map(|(t, _)| at(*t)).unwrap_or(-1.0);
    let mut settled = visible;
    for w in frames.windows(2) {
        if diff(&w[1].1, &w[0].1) > 0.3 {
            settled = at(w[1].0);
        }
    }
    hide(app, true);
    thread::sleep(Duration::from_millis(700));
    Ok(BenchRun { snap_ms: tm.snap_ms, show_ms: tm.show_ms, paint_ms: tm.paint_ms, visible_ms: visible, settled_ms: settled })
}

// Opens and closes the hub `runs` times, measuring each open. `game`: a window title standing in for the game.
#[tauri::command]
pub async fn hub_bench(app: AppHandle, runs: u32, game: Option<String>) -> Result<Vec<BenchRun>, String> {
    *app.state::<Hub>().game_title.lock().unwrap() = game;
    tauri::async_runtime::spawn_blocking(move || {
        let mut out = Vec::new();
        for _ in 0..runs {
            out.push(bench_once(&app)?);
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}
