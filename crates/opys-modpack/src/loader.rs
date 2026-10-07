use serde::{Deserialize, Serialize};

/// The loader a modpack runs on, as the arguments of the opys loader plugin
/// that provides it.
///
/// Each variant carries exactly what that plugin's constructor takes, which is
/// why they differ: Forge wants one fused `<minecraft>-<forge>` build id,
/// NeoForge a build id that names no Minecraft version at all, and Fabric the
/// two halves apart.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "loader", rename_all = "lowercase")]
pub enum LoaderSpec {
    /// `fabric(minecraft, { loader })`
    Fabric {
        minecraft: String,
        #[serde(rename = "fabricLoader")]
        fabric_loader: String,
    },
    /// `forge('<minecraft>-<forge>')`
    Forge { version: String },
    /// `neoforge('<neoforge>')`
    Neoforge { version: String },
    /// `minecraft('<minecraft>')` — a pack with no loader.
    Vanilla { minecraft: String },
}

impl LoaderSpec {
    /// Forge's build id is the Minecraft version and Forge's own, joined.
    pub fn forge(minecraft: &str, forge: &str) -> Self {
        LoaderSpec::Forge {
            version: format!("{minecraft}-{forge}"),
        }
    }

    /// The name of the plugin this resolves to.
    pub fn plugin(&self) -> &'static str {
        match self {
            LoaderSpec::Fabric { .. } => "fabric",
            LoaderSpec::Forge { .. } => "forge",
            LoaderSpec::Neoforge { .. } => "neoforge",
            LoaderSpec::Vanilla { .. } => "minecraft",
        }
    }
}
