use opys_core::OsOptions;

pub fn current_platform() -> OsOptions {
    let name = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    };
    let arch = if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "x86_64"
    };
    OsOptions {
        name: name.into(),
        version: String::new(),
        arch: arch.into(),
    }
}
