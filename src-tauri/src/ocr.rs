// Windows built-in OCR (Windows.Media.Ocr) on regions of a captured frame.
// Needs the Russian OCR language pack (Settings → Time & language → Language → Russian).

use image::{imageops, RgbaImage};
use windows::core::HSTRING;
use windows::Globalization::Language;
use windows::Graphics::Imaging::{BitmapAlphaMode, BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::OcrEngine;
use windows::Storage::Streams::DataWriter;

pub struct Ocr {
    engine: OcrEngine,
}

#[derive(Debug, Clone)]
pub struct Word {
    pub x: f32, // center, in the source frame's pixels
}

#[derive(Clone, Copy)]
pub enum Prep {
    // Colors as they are, upscaled.
    Color,
    // Binarized: the light gold / white name text becomes black on white (measured on 1080p frames:
    // R > 170 && G > 150 keeps the text and drops most of the item art behind it).
    Text,
}

impl Ocr {
    pub fn new() -> windows::core::Result<Self> {
        // WinRT on this thread; "already initialized" is fine.
        unsafe {
            let _ = windows::Win32::System::WinRT::RoInitialize(windows::Win32::System::WinRT::RO_INIT_MULTITHREADED);
        }
        let lang = Language::CreateLanguage(&HSTRING::from("ru"))?;
        let engine = OcrEngine::TryCreateFromLanguage(&lang)?;
        Ok(Self { engine })
    }

    // OCR of a region (x, y, w, h in frame pixels), upscaled by `scale`. Word positions are mapped
    // back to frame pixels.
    pub fn region(&self, frame: &RgbaImage, x: u32, y: u32, w: u32, h: u32, scale: f32, prep: Prep) -> windows::core::Result<(String, Vec<Word>)> {
        let (fw, fh) = frame.dimensions();
        let (x, y) = (x.min(fw - 1), y.min(fh - 1));
        let (w, h) = (w.min(fw - x), h.min(fh - y));
        let crop = imageops::crop_imm(frame, x, y, w, h).to_image();
        let (sw, sh) = (((w as f32) * scale) as u32, ((h as f32) * scale) as u32);
        let mut img = imageops::resize(&crop, sw, sh, imageops::FilterType::Triangle);

        // BGRA8 is what the OCR engine accepts everywhere.
        for p in img.pixels_mut() {
            let [r, g, b, _] = p.0;
            p.0 = match prep {
                Prep::Color => [b, g, r, 255],
                Prep::Text => {
                    let v = if r > 170 && g > 150 { 0 } else { 255 };
                    [v, v, v, 255]
                }
            };
        }

        let writer = DataWriter::new()?;
        writer.WriteBytes(img.as_raw())?;
        let buffer = writer.DetachBuffer()?;
        let bitmap = SoftwareBitmap::CreateCopyWithAlphaFromBuffer(&buffer, BitmapPixelFormat::Bgra8, sw as i32, sh as i32, BitmapAlphaMode::Premultiplied)?;
        let result = self.engine.RecognizeAsync(&bitmap)?.join()?;

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
}
