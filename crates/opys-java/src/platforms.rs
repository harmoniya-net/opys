use opys_core::{OsArch, OsName};
use serde::{Deserialize, Serialize};

use crate::error::JavaError;

/// Archs every vendor resolver in this crate targets. A narrowing of
/// [`OsArch`]: no JDK vendor here publishes 32-bit or `any` builds, so the
/// resolvers never have to answer what to do with one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SupportedArch {
    #[serde(rename = "x86_64")]
    X86_64,
    #[serde(rename = "aarch64")]
    Aarch64,
}

impl SupportedArch {
    /// Widen back to the rule-format arch, for the OS+arch rulesets the
    /// template emits.
    pub fn as_os_arch(self) -> OsArch {
        match self {
            SupportedArch::X86_64 => OsArch::X86_64,
            SupportedArch::Aarch64 => OsArch::Aarch64,
        }
    }
}

/// An (OS, arch) pair a vendor resolver fetches a binary for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Platform {
    pub os: OsName,
    pub arch: SupportedArch,
}

pub const DEFAULT_PLATFORMS: [Platform; 6] = [
    Platform {
        os: OsName::Linux,
        arch: SupportedArch::X86_64,
    },
    Platform {
        os: OsName::Linux,
        arch: SupportedArch::Aarch64,
    },
    Platform {
        os: OsName::Osx,
        arch: SupportedArch::X86_64,
    },
    Platform {
        os: OsName::Osx,
        arch: SupportedArch::Aarch64,
    },
    Platform {
        os: OsName::Windows,
        arch: SupportedArch::X86_64,
    },
    Platform {
        os: OsName::Windows,
        arch: SupportedArch::Aarch64,
    },
];

/// `/Contents/Home` on macOS, empty elsewhere. Every vendor this crate
/// supports (Temurin, Zulu, GraalVM CE) ships its macOS archive as a
/// `.jdk`-style bundle with this layout — verified against real archives,
/// not assumed from convention.
pub fn mac_home_suffix(os: OsName) -> &'static str {
    match os {
        OsName::Osx => "/Contents/Home",
        _ => "",
    }
}

/// The requested platform set, or the default when the caller didn't pick one.
pub(crate) fn platforms_or_default(requested: Option<&[Platform]>) -> &[Platform] {
    requested.unwrap_or(&DEFAULT_PLATFORMS)
}

/// Query every platform at once and keep the ones that answered, in the
/// requested order. A vendor API is one round trip per (os, arch); serialising
/// six of them is the whole cost of a JDK resolve, so they run on threads —
/// the TS original's `Promise.all`, minus the runtime.
///
/// `Ok(None)` means "this platform has no such build" and is dropped; the
/// first `Err` aborts the resolve, once every thread has been joined.
pub(crate) fn fan_out<T, F>(platforms: &[Platform], resolve: F) -> Result<Vec<T>, JavaError>
where
    F: Fn(Platform) -> Result<Option<T>, JavaError> + Sync,
    T: Send,
{
    let results: Vec<Result<Option<T>, JavaError>> = std::thread::scope(|scope| {
        let handles: Vec<_> = platforms
            .iter()
            .copied()
            .map(|platform| {
                let resolve = &resolve;
                scope.spawn(move || resolve(platform))
            })
            .collect();
        handles
            .into_iter()
            .map(|handle| handle.join().expect("resolver thread panicked"))
            .collect()
    });
    results.into_iter().filter_map(Result::transpose).collect()
}
