//! The dgpuj release this crate ships when a config names none.
//!
//! It is named here, with its hashes, and not looked up. What a config writes
//! after `command: '@dgpuj.bin'` is dgpuj's own command line, and that has
//! changed between releases: 0.6 takes the `java` to run as its first
//! argument, where 0.5 took the JDK's home behind a flag. So the launcher a
//! pack gets has to be the one this crate's documentation describes, and
//! "the newest" would be whichever was published last, tested against a
//! config or not. A build of the same config does not change under it
//! either, and there is no request to make. A newer release is a change to
//! this file.

use opys_dev::github::{GitHubAsset, GitHubRelease};

pub const DGPUJ_VERSION: &str = "v0.6.0";

/// Each archive of [`DGPUJ_VERSION`]: its name, its size and its sha256.
const ASSETS: [(&str, u64, &str); 5] = [
    (
        "dgpuj-aarch64-apple-darwin.tar.gz",
        1210,
        "e648bdfe7471b31a7cb7332331f30274fee463a115f15127bc5f6cc7c978a68b",
    ),
    (
        "dgpuj-aarch64-pc-windows-msvc.zip",
        1025,
        "f754240f353ce54569c1da98026cc6ab47ad3bb8fbf719bfb8e1584b856a1b4d",
    ),
    (
        "dgpuj-x86_64-apple-darwin.tar.gz",
        891,
        "f36963570b40a59e20cfcad0b33022c78c57fa04cf5f0b698e9dc319d39b2c41",
    ),
    (
        "dgpuj-x86_64-pc-windows-msvc.zip",
        947,
        "d90a21ccc99625b450b897b10ac34bd4e36b7fbf03cbd7172133160f2d794fa4",
    ),
    (
        "dgpuj-x86_64-unknown-linux-gnu.tar.gz",
        16885,
        "be4d4883685a585914ab650befff2dcb41a0ee16c46b2f7d333a97311b8dc9e6",
    ),
];

/// [`DGPUJ_VERSION`] in the shape GitHub would have answered with, so that
/// what follows a lookup and what follows none are one path.
pub(crate) fn baked_release(repo: &str) -> GitHubRelease {
    GitHubRelease {
        tag_name: DGPUJ_VERSION.to_owned(),
        prerelease: false,
        draft: false,
        published_at: String::new(),
        assets: ASSETS
            .iter()
            .map(|(name, size, sha256)| GitHubAsset {
                name: (*name).to_owned(),
                size: *size,
                browser_download_url: format!(
                    "https://github.com/{repo}/releases/download/{DGPUJ_VERSION}/{name}"
                ),
                digest: Some(format!("sha256:{sha256}")),
            })
            .collect(),
    }
}
