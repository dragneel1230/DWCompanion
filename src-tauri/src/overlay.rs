// Overlay: a transparent, always-on-top, click-through window over the primary monitor.
// It never takes focus from the game (not focusable, shown with SW_SHOWNOACTIVATE) and is only
// visible while the relic reward screen is up.

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

const LABEL: &str = "overlay";

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let win = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("overlay".into()))
        .title("DWCompanion overlay")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focusable(false)
        .focused(false)
        .visible(false)
        .build()?;
    if let Some(m) = win.primary_monitor()? {
        win.set_position(PhysicalPosition::new(m.position().x, m.position().y))?;
        win.set_size(PhysicalSize::new(m.size().width, m.size().height))?;
    }
    win.set_ignore_cursor_events(true)?;
    Ok(())
}

pub fn show(app: &AppHandle) {
    let Some(win) = app.get_webview_window(LABEL) else { return };
    if let Ok(hwnd) = win.hwnd() {
        use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, ShowWindow, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_SHOWNOACTIVATE};
        let hwnd = windows::Win32::Foundation::HWND(hwnd.0);
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
    }
}

pub fn hide(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(LABEL) {
        let _ = win.hide();
    }
}

#[tauri::command]
pub fn overlay_hide(app: AppHandle) {
    hide(&app);
}

// For testing the look without the game: show the overlay with a sample scan.
#[tauri::command]
pub fn overlay_show(app: AppHandle) {
    show(&app);
}
