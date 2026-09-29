mod bench;
mod ocr;
mod overlay;
mod reward;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(reward::init());
            let bench = bench::init(app.handle());
            app.manage(bench);
            if let Err(e) = overlay::create(app.handle()) {
                eprintln!("overlay window: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bench::bench_status,
            bench::bench_set_enabled,
            bench::bench_test,
            bench::bench_open_dir,
            reward::reward_scan_file,
            reward::reward_replay,
            overlay::overlay_show,
            overlay::overlay_hide
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
