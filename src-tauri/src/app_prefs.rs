// What closing the main window does. The overlay windows (hub, reward overlay) are always alive but hidden,
// so without this the process kept running after the main window was closed and the hub hotkey still
// opened the hub. Now: "keep in the tray" on -> the main window hides, a tray icon brings it back (the
// hotkey keeps working); off -> closing the main window quits the app.
// The labels come from the main window (Rust doesn't know the interface language).
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};

const TRAY: &str = "main-tray";

#[derive(Default)]
pub struct AppPrefs {
    tray: AtomicBool,
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

// Main window: close -> hide (tray on) or quit.
pub fn on_main_event(app: &AppHandle, e: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = e {
        if app.state::<AppPrefs>().tray.load(Ordering::Relaxed) {
            api.prevent_close();
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.hide();
            }
        } else {
            app.exit(0);
        }
    }
}

fn build_tray(app: &AppHandle, open: &str, quit: &str) -> tauri::Result<()> {
    let open_i = MenuItem::with_id(app, "open", open, true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", quit, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_i, &quit_i])?;
    let mut b = TrayIconBuilder::with_id(TRAY)
        .tooltip("DWCompanion")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, ev| match ev.id().as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        b = b.icon(icon.clone());
    }
    b.build(app)?;
    Ok(())
}

#[tauri::command]
pub fn app_set_prefs(app: AppHandle, tray: bool, open: String, quit: String) -> Result<(), String> {
    app.state::<AppPrefs>().tray.store(tray, Ordering::Relaxed);
    // Rebuilt on every call: the labels follow the interface language.
    let _ = app.remove_tray_by_id(TRAY);
    if tray {
        build_tray(&app, &open, &quit).map_err(|e| e.to_string())?;
    }
    Ok(())
}
