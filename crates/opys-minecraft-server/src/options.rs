//! What a config asks for.

use std::fmt;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// A jar the author already has: published somewhere, or on their disk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JarSource {
    /// Downloaded once at build time to be pinned.
    Link(String),
    /// Carried in the bundle. Spigot and CraftBukkit arrive this way: they
    /// are built on the author's machine and published nowhere.
    File(PathBuf),
}

impl JarSource {
    /// A link is told from a path by its scheme, which no path begins with.
    fn of(written: String) -> Self {
        if written.starts_with("http://") || written.starts_with("https://") {
            JarSource::Link(written)
        } else {
            JarSource::File(written.into())
        }
    }

    fn written(&self) -> String {
        match self {
            JarSource::Link(url) => url.clone(),
            JarSource::File(path) => path.to_string_lossy().into_owned(),
        }
    }
}

/// A core that is looked up by version: the name alone, which is all that
/// listing what it has needs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Core {
    Vanilla,
    Paper,
    Purpur,
    Fabric,
    Forge,
    Neoforge,
}

impl fmt::Display for Core {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Core::Vanilla => "Minecraft",
            Core::Paper => "Paper",
            Core::Purpur => "Purpur",
            Core::Fabric => "Fabric",
            Core::Forge => "Forge",
            Core::Neoforge => "NeoForge",
        })
    }
}

/// Which server, and which build of it.
///
/// Written as the options are: the field that names the core holds its
/// version, `{ "paper": "1.21.1", "build": "133" }`. It reads back as it is
/// written, so a core that has been resolved, with every field it left to
/// "the newest" filled in, is itself something to put in a config.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(into = "ServerOptionsWire")]
pub enum ServerCore {
    /// Mojang's own. No version takes the current release.
    Vanilla { version: Option<String> },
    /// No build takes the newest stable one for the version.
    Paper {
        version: String,
        build: Option<String>,
    },
    /// No build takes the newest one for the version.
    Purpur {
        version: String,
        build: Option<String>,
    },
    /// No loader takes the newest stable one.
    Fabric {
        version: String,
        loader: Option<String>,
    },
    /// By Minecraft version. No build takes the one Forge recommends, or
    /// its newest where it recommends none.
    Forge {
        version: String,
        build: Option<String>,
    },
    /// By NeoForge's own version, which is the whole of what names a build.
    Neoforge { version: String },
    /// A server jar the author has.
    Jar(JarSource),
    /// An installer the author has, of a fork of Forge or NeoForge. It is
    /// run by the starter as theirs is.
    Installer(JarSource),
}

impl ServerCore {
    /// Whether the server is put together by an installer on the machine
    /// that runs it, and so is started through the starter.
    pub fn installs(&self) -> bool {
        matches!(
            self,
            ServerCore::Forge { .. } | ServerCore::Neoforge { .. } | ServerCore::Installer(_)
        )
    }
}

/// Where each core is asked. Every field is a mirror, or the loopback
/// server of a test; one left out is the core's own address.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct Apis {
    /// Mojang's version manifest, the document itself.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mojang: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paper: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub purpur: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fabric: Option<String>,
    /// Where Forge lists its builds. Its jars are on [`Apis::forge_maven`].
    #[serde(skip_serializing_if = "Option::is_none")]
    pub forge: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub forge_maven: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub neoforge: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(try_from = "ServerOptionsWire")]
pub struct ServerOptions {
    pub core: ServerCore,
    pub apis: Apis,
}

/// A build as a config may write it. Paper's are numbers and Forge's are
/// not, so a build is text everywhere and a number is taken for one.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
enum Build {
    Text(String),
    Number(u64),
}

impl From<Build> for String {
    fn from(build: Build) -> String {
        match build {
            Build::Text(text) => text,
            Build::Number(number) => number.to_string(),
        }
    }
}

/// Every field any core takes, as a config writes them. Which of them go
/// together is [`ServerCore`]'s to say.
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ServerOptionsWire {
    #[serde(skip_serializing_if = "Option::is_none")]
    vanilla: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    paper: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    purpur: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    fabric: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    forge: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    neoforge: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    jar: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    installer: Option<String>,
    #[serde(skip_serializing)]
    build: Option<Build>,
    /// `build` as it is written back: always text.
    #[serde(rename(serialize = "build"), skip_deserializing)]
    #[serde(skip_serializing_if = "Option::is_none")]
    build_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    loader: Option<String>,
    #[serde(skip_serializing)]
    apis: Apis,
}

const CORES: &str =
    "`vanilla`, `paper`, `purpur`, `fabric`, `forge`, `neoforge`, `jar` or `installer`";

impl TryFrom<ServerOptionsWire> for ServerOptions {
    type Error = String;

    fn try_from(raw: ServerOptionsWire) -> Result<Self, String> {
        let build = raw.build.map(String::from);
        let loader = raw.loader;
        // A field of another core is refused and not ignored: `build` beside
        // vanilla would otherwise look like a pin and pin nothing.
        let only = |core: &str, build_too: bool, loader_too: bool| {
            let stray = [
                ("build", build.is_some() && !build_too),
                ("loader", loader.is_some() && !loader_too),
            ];
            match stray.iter().find(|(_, set)| *set) {
                Some((field, _)) => Err(format!("server({{ {field} }}) means nothing for {core}")),
                None => Ok(()),
            }
        };

        let named = [
            ("vanilla", raw.vanilla),
            ("paper", raw.paper),
            ("purpur", raw.purpur),
            ("fabric", raw.fabric),
            ("forge", raw.forge),
            ("neoforge", raw.neoforge),
            ("jar", raw.jar),
            ("installer", raw.installer),
        ];
        let mut written = named
            .into_iter()
            .filter_map(|(name, value)| value.map(|value| (name, value)));
        let core = match (written.next(), written.next()) {
            (Some((first, _)), Some((second, _))) => {
                return Err(format!(
                    "server({{ {first}, {second} }}) names two servers: a server is one of {CORES}"
                ))
            }
            // Nothing named is Mojang's current release.
            (None, _) => {
                only("vanilla", false, false)?;
                ServerCore::Vanilla { version: None }
            }
            (Some((name, version)), None) => match name {
                "vanilla" => {
                    only("vanilla", false, false)?;
                    ServerCore::Vanilla {
                        version: Some(version),
                    }
                }
                "paper" => {
                    only("Paper", true, false)?;
                    ServerCore::Paper { version, build }
                }
                "purpur" => {
                    only("Purpur", true, false)?;
                    ServerCore::Purpur { version, build }
                }
                "fabric" => {
                    only("Fabric", false, true)?;
                    ServerCore::Fabric { version, loader }
                }
                "forge" => {
                    only("Forge", true, false)?;
                    ServerCore::Forge { version, build }
                }
                "neoforge" => {
                    only("NeoForge, whose version is its build", false, false)?;
                    ServerCore::Neoforge { version }
                }
                "jar" => {
                    only("a jar of your own", false, false)?;
                    ServerCore::Jar(JarSource::of(version))
                }
                _ => {
                    only("an installer of your own", false, false)?;
                    ServerCore::Installer(JarSource::of(version))
                }
            },
        };
        Ok(ServerOptions {
            core,
            apis: raw.apis,
        })
    }
}

impl From<ServerCore> for ServerOptionsWire {
    fn from(core: ServerCore) -> Self {
        let mut wire = ServerOptionsWire::default();
        match core {
            ServerCore::Vanilla { version } => wire.vanilla = version,
            ServerCore::Paper { version, build } => {
                wire.paper = Some(version);
                wire.build_text = build;
            }
            ServerCore::Purpur { version, build } => {
                wire.purpur = Some(version);
                wire.build_text = build;
            }
            ServerCore::Fabric { version, loader } => {
                wire.fabric = Some(version);
                wire.loader = loader;
            }
            ServerCore::Forge { version, build } => {
                wire.forge = Some(version);
                wire.build_text = build;
            }
            ServerCore::Neoforge { version } => wire.neoforge = Some(version),
            ServerCore::Jar(jar) => wire.jar = Some(jar.written()),
            ServerCore::Installer(installer) => wire.installer = Some(installer.written()),
        }
        wire
    }
}
