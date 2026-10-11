//! `opys-minecraft-server` — a Minecraft server, as one plugin.
//!
//! A client is hundreds of files a manifest has to list. A server is one
//! jar: since 1.18 it unpacks its own libraries on first start, and Paper
//! and Fabric's launcher download theirs the same way. So this resolves a
//! core to that one jar, pins it, and says how to start it. What the jar
//! then fetches for itself is the jar's business and is in no manifest.
//!
//! Forge and NeoForge publish an installer and no server. Theirs is two
//! files: the installer, and NeoForge's own starter, a jar that runs the
//! installer where the server is not installed yet and then starts it in
//! the same process. So they too are `java -jar server.jar`.
//!
//! Every core is this one plugin, told apart by [`ServerCore`]. They differ
//! in where the files are asked for and in nothing after that. A core
//! answers three questions: which versions it has ([`list_versions`]), which
//! builds of one ([`list_builds`]), and what exactly a config resolves to
//! ([`resolve_server`]).
//!
//! Build-time only: the requests go through `opys-dev`'s blocking client,
//! which the runtime never links.

mod cores;
mod error;
mod options;
mod starter;
mod template;

pub use cores::{list_builds, list_versions, resolve_server, ResolvedServer};
pub use error::ServerError;
pub use options::{Apis, Core, JarSource, ServerCore, ServerOptions};
pub use starter::{STARTER_SHA256, STARTER_URL, STARTER_VERSION};
pub use template::{build_server, server_contribution, ServerBuild, EULA_FEATURE, PLUGIN_NAME};
