// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Some(code) = dwc_lib::autostart_cli() {
        std::process::exit(code);
    }
    use windows::core::w;
    use windows::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS};
    use windows::Win32::System::Threading::CreateMutexW;

    // The task and a manual launch must share one application instance.
    let instance = unsafe { CreateMutexW(None, false, w!("Local\\DWCompanion.Main")) };
    if instance.is_ok() && unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        return;
    }
    dwc_lib::run();
    if let Ok(handle) = instance {
        let _ = unsafe { CloseHandle(handle) };
    }
}
