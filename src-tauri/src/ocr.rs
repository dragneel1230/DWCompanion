// Windows built-in OCR (Windows.Media.Ocr) on regions of a captured frame.
// Needs the OCR language pack of the game client's language (Settings → Time & language → Language).

use image::{imageops, RgbaImage};
use windows::core::HSTRING;
use windows::Globalization::Language;
use windows::Graphics::Imaging::{BitmapAlphaMode, BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::{OcrEngine, OcrResult};
use windows::Storage::Streams::DataWriter;

pub struct Ocr {
    engine: OcrEngine,
}

#[derive(Debug, Clone)]
pub struct Word {
    pub x: f32, // center, in the source frame's pixels
}

// A recognized text line with its box, in the source frame's pixels.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Line {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub pass: u8, // which preparation produced it (set by the caller)
}

#[derive(Clone, Copy)]
pub enum Prep {
    // Colors as they are, upscaled.
    Color,
    // Binarized: the light gold / white name text becomes black on white (measured on 1080p frames:
    // R > 170 && G > 150 keeps the text and drops most of the item art behind it).
    Text,
    // Pale gold text (ducat kiosk tile names), black on white: drops grey-silver and saturated gold art.
    Beige,
    // Strokes brighter than their darkest neighbour (a morphological top-hat), black on white: the name's
    // dark outline keeps the letters, wide bright item art behind them drops out (white / gold armour,
    // where `Text` turns into one blob). Measured on 1080p reward cards: radius 3 px, step 60.
    Edge,
}

impl Ocr {
    // `lang`: the game client's language as EE.log names it ("ru", "en", ...).
    pub fn new(lang: &str) -> windows::core::Result<Self> {
        // WinRT on this thread; "already initialized" is fine.
        unsafe {
            let _ = windows::Win32::System::WinRT::RoInitialize(windows::Win32::System::WinRT::RO_INIT_MULTITHREADED);
        }
        let tag = match lang {
            "en" => "en-US",
            "tc" => "zh-Hant",
            "zh" => "zh-Hans",
            other => other,
        };
        let lang = Language::CreateLanguage(&HSTRING::from(tag))?;
        let engine = OcrEngine::TryCreateFromLanguage(&lang)?;
        Ok(Self { engine })
    }

    // OCR of a region (x, y, w, h in frame pixels), upscaled by `scale`. Word positions are mapped
    // back to frame pixels.
    pub fn region(&self, frame: &RgbaImage, x: u32, y: u32, w: u32, h: u32, scale: f32, prep: Prep) -> windows::core::Result<(String, Vec<Word>)> {
        let (result, x, _) = self.recognize(frame, x, y, w, h, scale, prep)?;
        let mut lines = Vec::new();
        let mut words = Vec::new();
        for line in result.Lines()? {
            lines.push(line.Text()?.to_string());
            for word in line.Words()? {
                let r = word.BoundingRect()?;
                words.push(Word { x: x as f32 + (r.X + r.Width / 2.0) / scale });
            }
        }
        Ok((lines.join(" "), words))
    }

    // Lines of text in a region, with boxes mapped back to frame pixels.
    pub fn lines(&self, frame: &RgbaImage, x: u32, y: u32, w: u32, h: u32, scale: f32, prep: Prep) -> windows::core::Result<Vec<Line>> {
        let (result, x, y) = self.recognize(frame, x, y, w, h, scale, prep)?;
        let mut out = Vec::new();
        for line in result.Lines()? {
            let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
            for word in line.Words()? {
                let r = word.BoundingRect()?;
                x0 = x0.min(r.X);
                y0 = y0.min(r.Y);
                x1 = x1.max(r.X + r.Width);
                y1 = y1.max(r.Y + r.Height);
            }
            if x1 < x0 {
                continue;
            }
            out.push(Line {
                text: line.Text()?.to_string(),
                x: x as f32 + x0 / scale,
                y: y as f32 + y0 / scale,
                w: (x1 - x0) / scale,
                h: (y1 - y0) / scale,
                pass: 0,
            });
        }
        Ok(out)
    }

    // Largest image side the engine accepts.
    pub fn max_side() -> u32 {
        OcrEngine::MaxImageDimension().unwrap_or(2600)
    }

    // Crops, upscales, prepares and recognizes; returns the result and the clamped region origin.
    fn recognize(&self, frame: &RgbaImage, x: u32, y: u32, w: u32, h: u32, scale: f32, prep: Prep) -> windows::core::Result<(OcrResult, u32, u32)> {
        let (fw, fh) = frame.dimensions();
        let (x, y) = (x.min(fw - 1), y.min(fh - 1));
        let (w, h) = (w.min(fw - x), h.min(fh - y));
        let mut crop = imageops::crop_imm(frame, x, y, w, h).to_image();
        if let Prep::Edge = prep {
            crop = top_hat(&crop, ((3.0 * fh as f32 / 1080.0).round() as i32).max(2), 60);
        }
        let (sw, sh) = (((w as f32) * scale) as u32, ((h as f32) * scale) as u32);
        let mut img = imageops::resize(&crop, sw, sh, imageops::FilterType::Triangle);

        // BGRA8 is what the OCR engine accepts everywhere.
        for p in img.pixels_mut() {
            let [r, g, b, _] = p.0;
            p.0 = match prep {
                Prep::Color | Prep::Edge => [b, g, r, 255],
                Prep::Text => {
                    let v = if r > 170 && g > 150 { 0 } else { 255 };
                    [v, v, v, 255]
                }
                Prep::Beige => {
                    let (r, g, b) = (r as i32, g as i32, b as i32);
                    let text = r > 120 && g > 105 && (r - g).abs() < 35 && b * 100 > r * 45 && b * 100 < r * 85;
                    let v = if text { 0 } else { 255 };
                    [v, v, v, 255]
                }
            };
        }

        let writer = DataWriter::new()?;
        writer.WriteBytes(img.as_raw())?;
        let buffer = writer.DetachBuffer()?;
        let bitmap = SoftwareBitmap::CreateCopyWithAlphaFromBuffer(&buffer, BitmapPixelFormat::Bgra8, sw as i32, sh as i32, BitmapAlphaMode::Premultiplied)?;
        Ok((self.engine.RecognizeAsync(&bitmap)?.join()?, x, y))
    }
}

// Black where a pixel is bright and at least `step` brighter than the darkest pixel within `r`
// (max filter of the darkness, done as two 1-D passes), white elsewhere.
fn top_hat(src: &RgbaImage, r: i32, step: u32) -> RgbaImage {
    let (w, h) = src.dimensions();
    let gray: Vec<u32> = src.pixels().map(|p| (p.0[0] as u32 * 3 + p.0[1] as u32 * 6 + p.0[2] as u32) / 10).collect();
    let at = |x: i32, y: i32| (y as u32 * w + x as u32) as usize;
    let mut rows = vec![0u32; gray.len()];
    for y in 0..h as i32 {
        for x in 0..w as i32 {
            rows[at(x, y)] = ((x - r).max(0)..=(x + r).min(w as i32 - 1)).map(|xx| gray[at(xx, y)]).min().unwrap();
        }
    }
    RgbaImage::from_fn(w, h, |x, y| {
        let (x, y) = (x as i32, y as i32);
        let min = ((y - r).max(0)..=(y + r).min(h as i32 - 1)).map(|yy| rows[at(x, yy)]).min().unwrap();
        let v = gray[at(x, y)];
        let c = if v > 120 && v - min > step { 0 } else { 255 };
        image::Rgba([c, c, c, 255])
    })
}
