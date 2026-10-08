// Windows Credential Manager: generic credentials for this user only (warframe.market token, game session).

use windows::core::{HSTRING, PWSTR};
use windows::Win32::Security::Credentials::{
    CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_FLAGS, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
};

pub fn write(target: &str, secret: &str) {
    let target = HSTRING::from(target);
    let mut blob = secret.as_bytes().to_vec();
    let cred = CREDENTIALW {
        Flags: CRED_FLAGS(0),
        Type: CRED_TYPE_GENERIC,
        TargetName: PWSTR(target.as_ptr() as *mut _),
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        ..Default::default()
    };
    unsafe {
        let _ = CredWriteW(&cred, 0);
    }
}

pub fn read(target: &str) -> Option<String> {
    let target = HSTRING::from(target);
    let mut p: *mut CREDENTIALW = std::ptr::null_mut();
    unsafe {
        CredReadW(&target, CRED_TYPE_GENERIC, None, &mut p).ok()?;
        let c = &*p;
        let bytes = std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize).to_vec();
        CredFree(p as *const _);
        String::from_utf8(bytes).ok().filter(|s| !s.is_empty())
    }
}

pub fn delete(target: &str) {
    let target = HSTRING::from(target);
    unsafe {
        let _ = CredDeleteW(&target, CRED_TYPE_GENERIC, None);
    }
}
