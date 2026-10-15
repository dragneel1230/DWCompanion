use crate::autostart_task;
use serde::Serialize;
use std::{
    os::windows::{
        ffi::{OsStrExt, OsStringExt},
        process::CommandExt,
    },
    path::{Path, PathBuf},
    sync::Mutex,
};
use windows::core::{w, Interface, BSTR, PCWSTR, PWSTR};
use windows::Win32::{
    Foundation::{CloseHandle, LocalFree, HANDLE, HLOCAL},
    Security::{
        Authorization::ConvertSidToStringSidW, GetTokenInformation, TokenUser, TOKEN_QUERY,
        TOKEN_USER,
    },
    System::{
        Com::{
            CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED,
        },
        TaskScheduler::{
            IExecAction, ITaskFolder, ITaskService, TaskScheduler, TASK_CREATE_OR_UPDATE,
            TASK_LOGON_INTERACTIVE_TOKEN, TASK_VALIDATE_ONLY,
        },
        Threading::{
            GetCurrentProcess, GetExitCodeProcess, OpenProcessToken, WaitForSingleObject, INFINITE,
        },
        Variant::VARIANT,
    },
    UI::{
        Shell::{
            Common::COMDLG_FILTERSPEC, FileOpenDialog, IFileOpenDialog, ShellExecuteExW,
            FOS_FILEMUSTEXIST, FOS_FORCEFILESYSTEM, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS,
            SHELLEXECUTEINFOW, SIGDN_FILESYSPATH,
        },
        WindowsAndMessaging::SW_SHOWNORMAL,
    },
};

const FAILED: &str = "rust.autostart.failed";
const CANCELLED: &str = "rust.autostart.cancelled";
static CHANGING: Mutex<()> = Mutex::new(());

fn error(e: windows::core::Error) -> String {
    eprintln!("autostart: {e}");
    if e.code().0 as u32 == 0x800704c7 {
        CANCELLED.into()
    } else {
        FAILED.into()
    }
}
struct Com;
impl Com {
    fn init() -> Result<Self, String> {
        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED)
                .ok()
                .map_err(error)?;
        }
        Ok(Self)
    }
}
impl Drop for Com {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}
struct Handle(HANDLE);
impl Drop for Handle {
    fn drop(&mut self) {
        let _ = unsafe { CloseHandle(self.0) };
    }
}
fn wide(value: impl AsRef<std::ffi::OsStr>) -> Vec<u16> {
    value.as_ref().encode_wide().chain(Some(0)).collect()
}
fn sid() -> Result<String, String> {
    unsafe {
        let mut token = HANDLE::default();
        OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).map_err(error)?;
        let token = Handle(token);
        let mut size = 0;
        let _ = GetTokenInformation(token.0, TokenUser, None, 0, &mut size);
        if size == 0 {
            return Err(FAILED.into());
        }
        let mut buffer = vec![0usize; (size as usize).div_ceil(std::mem::size_of::<usize>())];
        GetTokenInformation(
            token.0,
            TokenUser,
            Some(buffer.as_mut_ptr().cast()),
            size,
            &mut size,
        )
        .map_err(error)?;
        let user = &*(buffer.as_ptr().cast::<TOKEN_USER>());
        let mut text = PWSTR::null();
        ConvertSidToStringSidW(user.User.Sid, &mut text).map_err(error)?;
        let result = text.to_string().map_err(|_| FAILED.to_string());
        let _ = LocalFree(Some(HLOCAL(text.0.cast())));
        result
    }
}
fn folder() -> Result<ITaskFolder, String> {
    unsafe {
        let service: ITaskService =
            CoCreateInstance(&TaskScheduler, None, CLSCTX_INPROC_SERVER).map_err(error)?;
        let empty = VARIANT::default();
        service
            .Connect(&empty, &empty, &empty, &empty)
            .map_err(error)?;
        service.GetFolder(&BSTR::from("\\")).map_err(error)
    }
}
fn task_name(sid: &str) -> BSTR {
    BSTR::from(format!("DWCompanion-Warframe-{sid}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    enabled: bool,
    game_path: String,
}

fn status() -> Result<Status, String> {
    unsafe {
        let task = match folder()?.GetTask(&task_name(&sid()?)) {
            Ok(task) => task,
            Err(e) if e.code().0 as u32 == 0x80070002 => {
                return Ok(Status {
                    enabled: false,
                    game_path: String::new(),
                })
            }
            Err(e) => return Err(error(e)),
        };
        let definition = task.Definition().map_err(error)?;
        let mut game = BSTR::new();
        definition
            .RegistrationInfo()
            .map_err(error)?
            .Source(&mut game)
            .map_err(error)?;
        let action: IExecAction = definition
            .Actions()
            .map_err(error)?
            .get_Item(1)
            .map_err(error)?
            .cast()
            .map_err(error)?;
        let mut exe = BSTR::new();
        action.Path(&mut exe).map_err(error)?;
        let current = std::env::current_exe().map_err(|_| FAILED)?;
        Ok(Status {
            enabled: task.Enabled().map_err(error)?.as_bool()
                && Path::new(&exe.to_string()) == current,
            game_path: game.to_string(),
        })
    }
}
fn choose(title: &str) -> Result<PathBuf, String> {
    unsafe {
        let dialog: IFileOpenDialog =
            CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).map_err(error)?;
        let title = wide(title);
        dialog.SetTitle(PCWSTR(title.as_ptr())).map_err(error)?;
        dialog
            .SetFileTypes(&[COMDLG_FILTERSPEC {
                pszName: w!("Warframe"),
                pszSpec: w!("Warframe.x64.exe;Warframe.exe"),
            }])
            .map_err(error)?;
        dialog
            .SetOptions(FOS_FILEMUSTEXIST | FOS_FORCEFILESYSTEM)
            .map_err(error)?;
        dialog.Show(None).map_err(error)?;
        let name = dialog
            .GetResult()
            .map_err(error)?
            .GetDisplayName(SIGDN_FILESYSPATH)
            .map_err(error)?;
        let path = name.to_string().map_err(|_| FAILED.to_string());
        CoTaskMemFree(Some(name.0.cast()));
        let path = PathBuf::from(path?);
        validate_game(&path)?;
        Ok(path)
    }
}
fn validate_game(path: &Path) -> Result<(), String> {
    let name = path.file_name().and_then(|x| x.to_str()).unwrap_or("");
    if path.is_absolute()
        && path.is_file()
        && (name.eq_ignore_ascii_case("Warframe.x64.exe")
            || name.eq_ignore_ascii_case("Warframe.exe"))
    {
        Ok(())
    } else {
        Err("rust.autostart.game".into())
    }
}
fn elevate(enabled: bool, sid: &str, game: &Path) -> Result<(), String> {
    let exe = wide(std::env::current_exe().map_err(|_| FAILED)?);
    let args = format!(
        "--warframe-autostart {} {} {}",
        if enabled { "enable" } else { "disable" },
        autostart_task::quote_arg(sid),
        autostart_task::quote_arg(game.to_str().ok_or(FAILED)?)
    );
    let args = wide(args);
    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC,
        lpVerb: w!("runas"),
        lpFile: PCWSTR(exe.as_ptr()),
        lpParameters: PCWSTR(args.as_ptr()),
        nShow: SW_SHOWNORMAL.0,
        ..Default::default()
    };
    unsafe {
        ShellExecuteExW(&mut info).map_err(error)?;
        if info.hProcess.is_invalid() {
            return Err(FAILED.into());
        }
        let process = Handle(info.hProcess);
        WaitForSingleObject(process.0, INFINITE);
        let mut code = 1;
        GetExitCodeProcess(process.0, &mut code).map_err(error)?;
        if code == 0 {
            Ok(())
        } else {
            Err(FAILED.into())
        }
    }
}
// The administrative helper starts no webview and never accesses the game.
fn configure(mode: &str, user: &str, game: &Path) -> Result<(), String> {
    if !user.starts_with("S-1-")
        || !user
            .chars()
            .all(|c| c.is_ascii_digit() || c == '-' || c == 'S')
    {
        return Err(FAILED.into());
    }
    let folder = folder()?;
    let name = task_name(user);
    if mode == "disable" {
        return match unsafe { folder.DeleteTask(&name, 0) } {
            Ok(()) => Ok(()),
            Err(e) if e.code().0 as u32 == 0x80070002 => Ok(()),
            Err(e) => Err(error(e)),
        };
    }
    if mode != "validate" {
        validate_game(game)?;
    }
    let exe = std::env::current_exe().map_err(|_| FAILED)?;
    let working = exe.parent().and_then(Path::to_str).ok_or(FAILED)?;
    let xml = BSTR::from(autostart_task::xml(
        user,
        exe.to_str().ok_or(FAILED)?,
        game.to_str().ok_or(FAILED)?,
        working,
    ));
    let empty = VARIANT::default();
    let user_variant = VARIANT::from(user);
    let validation = unsafe {
        folder
            .RegisterTask(
                &name,
                &xml,
                TASK_VALIDATE_ONLY.0,
                &user_variant,
                &empty,
                TASK_LOGON_INTERACTIVE_TOKEN,
                &empty,
            )
    };
    // Validation returns S_OK with no task object; windows-rs maps that null to an empty error.
    match validation {
        Ok(_) => (),
        Err(e) if e.code().0 == 0 => (),
        Err(e) => return Err(error(e)),
    }
    if mode == "validate" {
        return Ok(());
    }
    // Shared auditing: enable success only, and leave it enabled when removing our task.
    let mut system = vec![0u16; 32768];
    let length =
        unsafe { windows::Win32::System::SystemInformation::GetSystemDirectoryW(Some(&mut system)) }
            as usize;
    if length == 0 || length >= system.len() {
        return Err(FAILED.into());
    }
    let system = PathBuf::from(std::ffi::OsString::from_wide(&system[..length]));
    let audit = std::process::Command::new(system.join("auditpol.exe"))
        .args([
            "/set",
            "/subcategory:{0CCE922B-69AE-11D9-BED3-505054503030}",
            "/success:enable",
        ])
        .creation_flags(0x08000000)
        .output()
        .map_err(|_| FAILED)?;
    if !audit.status.success() {
        return Err(FAILED.into());
    }
    let sddl = VARIANT::from(format!("D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GR;;;{user})").as_str());
    unsafe {
        folder
            .RegisterTask(
                &name,
                &xml,
                TASK_CREATE_OR_UPDATE.0,
                &user_variant,
                &empty,
                TASK_LOGON_INTERACTIVE_TOKEN,
                &sddl,
            )
            .map_err(error)?;
    }
    Ok(())
}
pub fn cli() -> Option<i32> {
    let args: Vec<_> = std::env::args_os().collect();
    if args.get(1).is_none_or(|x| x != "--warframe-autostart") {
        return None;
    }
    let result = (|| {
        let _com = Com::init()?;
        let mode = args.get(2).and_then(|x| x.to_str()).ok_or(FAILED)?;
        if mode == "status" {
            println!("{}", serde_json::to_string(&status()?).map_err(|_| FAILED)?);
            return Ok(());
        }
        if !matches!(mode, "enable" | "disable" | "validate") {
            return Err(FAILED.into());
        }
        let user = args.get(3).and_then(|x| x.to_str()).ok_or(FAILED)?;
        let game = args.get(4).map(PathBuf::from).unwrap_or_default();
        if cfg!(debug_assertions) && mode != "validate" {
            return Err("rust.autostart.dev".into());
        }
        configure(mode, user, &game)
    })();
    if let Err(message) = &result {
        eprintln!("autostart: {message}");
    }
    Some(if result.is_ok() { 0 } else { 1 })
}
async fn worker<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        std::thread::spawn(move || {
            let _com = Com::init()?;
            f()
        })
        .join()
        .map_err(|_| FAILED.to_string())?
    })
    .await
    .map_err(|_| FAILED.to_string())?
}
#[tauri::command]
pub async fn autostart_status() -> Result<Status, String> {
    worker(status).await
}
#[tauri::command]
pub async fn autostart_set(enabled: bool, title: String) -> Result<Status, String> {
    worker(move || {
        let _guard = CHANGING.try_lock().map_err(|_| "rust.autostart.busy")?;
        if cfg!(debug_assertions) {
            return Err("rust.autostart.dev".into());
        }
        let game = if enabled {
            choose(&title)?
        } else {
            PathBuf::new()
        };
        elevate(enabled, &sid()?, &game)?;
        let result = status()?;
        if result.enabled != enabled {
            return Err(FAILED.into());
        }
        Ok(result)
    })
    .await
}
