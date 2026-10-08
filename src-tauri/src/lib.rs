mod app_prefs;
mod bench;
mod cred;
mod hub;
mod journal;
mod kiosk;
mod inv_helper;
mod inv_session;
mod ocr;
mod overlay;
mod reward;
mod wfm;
mod wfm_status;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        // Updates: GitHub Releases (latest.json), signed with the key in %USERPROFILE%\.tauri (scripts/release.mjs).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(hub::plugin())
        .on_window_event(|w, e| {
            if w.label() == "main" {
                app_prefs::on_main_event(w.app_handle(), e);
            }
        })
        .setup(|app| {
            app.manage(app_prefs::AppPrefs::default());
            app.manage(hub::Hub::default());
            app.manage(reward::init());
            app.manage(kiosk::init());
            app.manage(wfm::init());
            app.manage(wfm_status::WfmStatus::default());
            app.manage(journal::init(app.handle()));
            let bench = bench::init(app.handle());
            app.manage(bench);
            if let Err(e) = overlay::create(app.handle()) {
                eprintln!("overlay window: {e}");
            }
            if let Err(e) = hub::create(app.handle()) {
                eprintln!("hub window: {e}");
            }
            // The hotkey is registered by the main window at start (hub_set_enabled): the hub may be turned off.
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
            hub::hub_set_enabled,
            app_prefs::app_set_prefs,
            hub::hub_open_in_app,
            hub::hub_painted,
            hub::hub_bench,
            overlay::overlay_show,
            overlay::overlay_hide,
            inv_helper::inv_helper_run,
            inv_session::inv_session_fetch,
            inv_session::inv_session_game_running,
            inv_session::inv_session_clear,
            inv_session::inv_session_account,
            inv_helper::inv_helper_find,
            inv_helper::inv_helper_installed,
            inv_helper::inv_helper_install,
            inv_helper::inv_helper_remove,
            kiosk::kiosk_config,
            kiosk::kiosk_replay,
            wfm::wfm_me,
            wfm::wfm_login,
            wfm::wfm_logout,
            wfm::wfm_call,
            wfm_status::wfm_status_get,
            wfm_status::wfm_status_set,
            wfm_status::wfm_status_auto,
            wfm_status::game_window_open
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
