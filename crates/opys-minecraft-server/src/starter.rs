//! NeoForge's [ServerStarterJar]: what makes a Forge or NeoForge server one
//! command.
//!
//! Their download is an installer, which patches Minecraft on the machine
//! it runs on, and the result is started through an argument file. That is
//! two commands, and a manifest has one. The starter is `java -jar`: where
//! there is no server yet it runs the installer beside it, and then loads
//! the server into its own process, so nothing stays behind as a parent.
//!
//! One release is named here, with its hash, and not looked up: it is the
//! one this crate was tested with, a build of the same config does not
//! change under it, and there is no request to make. A newer one is a
//! change to this file.
//!
//! [ServerStarterJar]: https://github.com/neoforged/ServerStarterJar

pub const STARTER_VERSION: &str = "0.1.35";
pub const STARTER_URL: &str =
    "https://github.com/neoforged/ServerStarterJar/releases/download/0.1.35/server.jar";
pub const STARTER_SHA256: &str = "d019d815868d451e57bdb965174b8443ec361336e84e9c41abc41a6c627bacd1";
pub(crate) const STARTER_SIZE: u64 = 25_891;

/// Has the starter run the installer again when the one beside it is of
/// another version than what is installed. Without it a pack that moves to
/// a newer build would go on starting the old one.
pub(crate) const REINSTALL: &str = "--installer-force";

/// The starter reads Forge's run scripts, and Forge has written them since
/// 1.17. Before that an installed server is a jar of its own and nothing
/// here starts it.
///
/// This reads a Minecraft version, which a build id must never be made to
/// yield. Here it is the version the author wrote, and all that is asked
/// of it is whether it is one of the old `1.x` line below 17.
pub(crate) fn predates_starter(minecraft: &str) -> bool {
    let mut parts = minecraft.split('.');
    parts.next() == Some("1")
        && parts
            .next()
            .and_then(|minor| minor.parse::<u32>().ok())
            .is_some_and(|minor| minor < 17)
}

#[cfg(test)]
mod tests {
    use super::predates_starter;

    #[test]
    fn forge_is_started_from_1_17_on() {
        for old in ["1.16.5", "1.12.2", "1.7.10", "1.1"] {
            assert!(predates_starter(old), "{old}");
        }
        // The year-based line has no leading `1.` and is never old.
        for new in ["1.17", "1.17.1", "1.21.1", "26.1", "26.3"] {
            assert!(!predates_starter(new), "{new}");
        }
    }
}
