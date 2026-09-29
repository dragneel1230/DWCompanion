// Measurement stand for the relic reward overlay.
// Tails EE.log and, on a relic reward line, records the screen for a few seconds so we can measure
// real timings (log delay, card animation) and card positions at the user's resolution.
// The game process is never touched: EE.log is only read, frames come from Windows Graphics Capture.

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

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

// Lines worth keeping for analysis (script names in EE.log are English in every client language).
const KEEP: &[&str] = &["Projection", "Relic", "Reward", "reward", "EndOfMatch", "Void", "Fissure", "MissionIntro", "Mission name"];
// Lines that mean "the relic reward screen is opening". Measured 2026-09-29 (1920x1080, ru client):
// OpenVoidProjectionRewardScreen reaches us ~20 ms after the game writes it, card names are on
// screen ~0.3 s later; "Got rewards" is flushed with a ~2.7 s delay, so it is only a fallback.
const TRIGGER: &[&str] = &[
    "OpenVoidProjectionRewardScreen",
    "Created /Lotus/Interface/ProjectionRewardChoice.swf",
    "ProjectionRewardChoice.lua: Got rewards",
];

const RECORD_FOR: Duration = Duration::from_secs(5);
const FRAME_EVERY: Duration = Duration::from_millis(100); // JPEG
const LOSSLESS_EVERY: Duration = Duration::from_millis(1000); // PNG, for OCR experiments
const MAX_RECORDINGS: u32 = 40; // per app run, keeps the disk in check

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[derive(Clone, Serialize)]
pub struct Status {
    pub enabled: bool,
    pub log_path: String,
    pub log_found: bool,
    pub session_dir: String,
    pub recordings: u32,
    pub recording: bool,
    pub last_error: Option<String>,
}

#[derive(Clone, Serialize)]
struct LineEvent {
    t: u64,
    line: String,
    trigger: bool,
}

pub struct Bench {
    status: Mutex<Status>,
    session: PathBuf,
    last_trigger: Mutex<Option<Instant>>,
}

pub type BenchState = Arc<Bench>;

impl Bench {
    fn status(&self) -> Status {
        self.status.lock().unwrap().clone()
    }
    fn update(&self, app: &AppHandle, f: impl FnOnce(&mut Status)) {
        let s = {
            let mut s = self.status.lock().unwrap();
            f(&mut s);
            s.clone()
        };
        let _ = app.emit("bench-status", s);
    }
    // Debug trail on disk, only while debug recording is on.
    fn note(&self, line: &str) {
        if !self.status().enabled {
            return;
        }
        let _ = fs::create_dir_all(&self.session);
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(self.session.join("log.txt")) {
            let _ = writeln!(f, "{}\t{}", now_ms(), line);
        }
    }
}

pub fn init(app: &AppHandle) -> BenchState {
    let log_path = std::env::var("LOCALAPPDATA").map(|p| PathBuf::from(p).join("Warframe").join("EE.log")).unwrap_or_default();
    let base = app.path().app_local_data_dir().unwrap_or_else(|_| std::env::temp_dir()).join("bench");
    let session = base.join(format!("session-{}", now_ms() / 1000));

    let bench = Arc::new(Bench {
        status: Mutex::new(Status {
            enabled: false, // screen recording is for debugging; the app turns it on from settings
            log_path: log_path.display().to_string(),
            log_found: log_path.exists(),
            session_dir: session.display().to_string(),
            recordings: 0,
            recording: false,
            last_error: None,
        }),
        session,
        last_trigger: Mutex::new(None),
    });

    let (b, a) = (bench.clone(), app.clone());
    thread::spawn(move || tail_log(a, b, log_path));
    bench
}

// Reads what the game appends to EE.log. Starts at the end (only new lines); a shrinking file
// means the game restarted and wrote a fresh log.
fn tail_log(app: AppHandle, bench: BenchState, path: PathBuf) {
    let mut pos: u64 = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    let mut carry: Vec<u8> = Vec::new();
    loop {
        thread::sleep(Duration::from_millis(100));
        let Ok(meta) = fs::metadata(&path) else {
            if bench.status().log_found {
                bench.update(&app, |s| s.log_found = false);
            }
            continue;
        };
        if !bench.status().log_found {
            bench.update(&app, |s| s.log_found = true);
        }
        let len = meta.len();
        if len < pos {
            pos = 0;
            carry.clear();
        }
        if len == pos {
            continue;
        }
        let Ok(mut f) = File::open(&path) else { continue };
        if f.seek(SeekFrom::Start(pos)).is_err() {
            continue;
        }
        let mut buf = Vec::with_capacity((len - pos) as usize);
        if f.take(len - pos).read_to_end(&mut buf).is_err() {
            continue;
        }
        pos += buf.len() as u64;
        carry.extend_from_slice(&buf);

        while let Some(nl) = carry.iter().position(|&c| c == b'\n') {
            let raw: Vec<u8> = carry.drain(..=nl).collect();
            let line = String::from_utf8_lossy(&raw).trim_end().to_string();
            on_line(&app, &bench, &line);
        }
    }
}

fn on_line(app: &AppHandle, bench: &BenchState, line: &str) {
    crate::reward::on_line(app, line);
    let trigger = TRIGGER.iter().any(|k| line.contains(k));
    if !trigger && !KEEP.iter().any(|k| line.contains(k)) {
        return;
    }
    bench.note(line);
    let _ = app.emit("bench-line", LineEvent { t: now_ms(), line: line.to_string(), trigger });
    if trigger && bench.status().enabled {
        // Several trigger lines arrive together; one recording per reward screen.
        let mut last = bench.last_trigger.lock().unwrap();
        if last.map_or(true, |t| t.elapsed() > Duration::from_secs(10)) {
            *last = Some(Instant::now());
            drop(last);
            start_recording(app, bench, "reward");
        }
    }
}

// ---------- screen recording

type Job = (PathBuf, u32, u32, Vec<u8>, bool);

struct Recorder {
    dir: PathBuf,
    start: Instant,
    last_frame: Option<Instant>,
    last_lossless: Option<Instant>,
    jobs: Sender<Job>,
    index: Vec<String>,
    scratch: Vec<u8>,
}

struct RecFlags {
    dir: PathBuf,
    jobs: Sender<Job>,
}

impl GraphicsCaptureApiHandler for Recorder {
    type Flags = RecFlags;
    type Error = Box<dyn std::error::Error + Send + Sync>;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        Ok(Self {
            dir: ctx.flags.dir,
            start: Instant::now(),
            last_frame: None,
            last_lossless: None,
            jobs: ctx.flags.jobs,
            index: Vec::new(),
            scratch: Vec::new(),
        })
    }

    fn on_frame_arrived(&mut self, frame: &mut Frame, control: InternalCaptureControl) -> Result<(), Self::Error> {
        let elapsed = self.start.elapsed();
        if elapsed > RECORD_FOR {
            let _ = fs::write(self.dir.join("frames.txt"), self.index.join("\n"));
            control.stop();
            return Ok(());
        }
        if self.last_frame.is_some_and(|t| t.elapsed() < FRAME_EVERY) {
            return Ok(());
        }
        self.last_frame = Some(Instant::now());
        let lossless = self.last_lossless.map_or(true, |t| t.elapsed() >= LOSSLESS_EVERY);
        if lossless {
            self.last_lossless = Some(Instant::now());
        }

        let (w, h) = (frame.width(), frame.height());
        let fb = frame.buffer()?;
        let pixels = fb.as_nopadding_buffer(&mut self.scratch).to_vec();
        let ms = elapsed.as_millis();
        let name = format!("{ms:05}");
        self.index.push(format!("{name}\t{}\t{w}x{h}\t{}", now_ms(), if lossless { "png" } else { "jpg" }));
        let _ = self.jobs.send((self.dir.join(name), w, h, pixels, lossless));
        Ok(())
    }
}

// Encoder threads, shared by all recordings.
fn encoder() -> Sender<Job> {
    let (tx, rx) = channel::<Job>();
    let rx = Arc::new(Mutex::new(rx));
    for _ in 0..3 {
        let rx: Arc<Mutex<Receiver<Job>>> = rx.clone();
        thread::spawn(move || loop {
            let job = rx.lock().unwrap().recv();
            let Ok((path, w, h, rgba, lossless)) = job else { return };
            let Some(img) = image::RgbaImage::from_raw(w, h, rgba) else { continue };
            if lossless {
                let _ = img.save(path.with_extension("png"));
            }
            let rgb = image::DynamicImage::ImageRgba8(img).to_rgb8();
            if let Ok(f) = File::create(path.with_extension("jpg")) {
                let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(std::io::BufWriter::new(f), 88);
                let _ = enc.encode_image(&rgb);
            }
        });
    }
    tx
}

static JOBS: std::sync::OnceLock<Mutex<Sender<Job>>> = std::sync::OnceLock::new();

pub fn start_recording(app: &AppHandle, bench: &BenchState, why: &str) {
    let st = bench.status();
    if st.recording || st.recordings >= MAX_RECORDINGS {
        return;
    }
    let n = st.recordings + 1;
    let dir = bench.session.join(format!("{n:02}-{why}"));
    if let Err(e) = fs::create_dir_all(&dir) {
        bench.update(app, |s| s.last_error = Some(e.to_string()));
        return;
    }
    bench.note(&format!("[bench] recording {n} started ({why})"));
    bench.update(app, |s| {
        s.recording = true;
        s.recordings = n;
    });

    let jobs = JOBS.get_or_init(|| Mutex::new(encoder())).lock().unwrap().clone();
    let (app, bench) = (app.clone(), bench.clone());
    thread::spawn(move || {
        let result = (|| -> Result<(), String> {
            // The game runs borderless on the primary monitor.
            let monitor = Monitor::primary().map_err(|e| e.to_string())?;
            let settings = Settings::new(
                monitor,
                CursorCaptureSettings::WithoutCursor,
                DrawBorderSettings::WithoutBorder,
                SecondaryWindowSettings::Default,
                MinimumUpdateIntervalSettings::Custom(Duration::from_millis(30)),
                DirtyRegionSettings::Default,
                ColorFormat::Rgba8,
                RecFlags { dir, jobs },
            );
            Recorder::start(settings).map_err(|e| e.to_string())
        })();
        bench.note(&format!("[bench] recording {n} finished: {}", result.as_ref().map_or_else(|e| e.as_str(), |_| "ok")));
        bench.update(&app, |s| {
            s.recording = false;
            s.last_error = result.err();
        });
    });
}

// Frame and OCR result of every overlay scan, for checking recognition later.
pub fn save_scan(app: &AppHandle, img: &image::RgbaImage, scan: &crate::reward::Scan) {
    let Some(bench) = app.try_state::<BenchState>() else { return };
    if !bench.status().enabled {
        return;
    }
    let _ = fs::create_dir_all(&bench.session);
    let name = format!("scan-{}", now_ms());
    let _ = img.save(bench.session.join(format!("{name}.png")));
    let _ = fs::write(bench.session.join(format!("{name}.json")), serde_json::to_string_pretty(scan).unwrap_or_default());
    bench.note(&format!("[scan] {name}: {} ms, {} frames", scan.ms, scan.frames));
}

pub fn set_recording(app: &AppHandle, on: bool) {
    if let Some(bench) = app.try_state::<BenchState>() {
        bench.update(app, |s| s.enabled = on);
    }
}

// ---------- commands

#[tauri::command]
pub fn bench_status(bench: tauri::State<BenchState>) -> Status {
    bench.status()
}

#[tauri::command]
pub fn bench_set_enabled(app: AppHandle, bench: tauri::State<BenchState>, enabled: bool) -> Status {
    bench.update(&app, |s| s.enabled = enabled);
    bench.status()
}

#[tauri::command]
pub fn bench_test(app: AppHandle, bench: tauri::State<BenchState>) {
    start_recording(&app, &bench, "test");
}

#[tauri::command]
pub fn bench_open_dir(bench: tauri::State<BenchState>) {
    let _ = fs::create_dir_all(&bench.session);
    let _ = std::process::Command::new("explorer").arg(&bench.session).spawn();
}
