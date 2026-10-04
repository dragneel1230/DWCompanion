mod bench;
mod hub;
mod journal;
mod kiosk;
mod inventory;
mod ocr;
mod overlay;
mod reward;
mod wfm;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(hub::plugin())
        .setup(|app| {
            app.manage(hub::Hub::default());
            app.manage(reward::init());
            app.manage(inventory::init());
            app.manage(kiosk::init());
            app.manage(wfm::init());
            app.manage(journal::init(app.handle()));
            let bench = bench::init(app.handle());
            app.manage(bench);
            if let Err(e) = overlay::create(app.handle()) {
                eprintln!("overlay window: {e}");
            }
            if let Err(e) = hub::create(app.handle()) {
                eprintln!("hub window: {e}");
            }
            // The saved hotkey comes from the main window at start (hub_set_shortcut).
            if let Err(e) = hub::set_shortcut(app.handle(), hub::DEFAULT_SHORTCUT) {
                eprintln!("hub hotkey: {e}");
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
            reward::overlay_config,
            reward::reward_names,
            reward::overlay_demo,
            reward::mission_state,
            reward::client_lang,
            journal::journal_list,
            journal::account_id,
            journal::journal_offer,
            journal::journal_pick,
            journal::journal_delete,
            hub::hub_toggle,
            hub::hub_hide,
            hub::hub_set_shortcut,
            hub::hub_open_in_app,
            hub::hub_painted,
            hub::hub_bench,
            overlay::overlay_show,
            overlay::overlay_hide,
            inventory::inv_scan_start,
            inventory::inv_scan_stop,
            kiosk::kiosk_config,
            kiosk::kiosk_replay,
            wfm::wfm_me,
            wfm::wfm_login,
            wfm::wfm_logout,
            wfm::wfm_call
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
