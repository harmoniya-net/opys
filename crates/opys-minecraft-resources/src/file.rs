//! The file: a table per side, in each a table per directory, and in that
//! an entry per file.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::entry::Entry;
use crate::error::ResourcesError;

/// Which installation a build is of.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Client,
    Server,
}

/// The directories a file may list into without saying where they are: each
/// is under the game directory, by its own name.
pub const BUILT_IN_DIRS: [&str; 5] = [
    "mods",
    "resourcepacks",
    "shaderpacks",
    "plugins",
    "datapacks",
];

/// One table of the file: for each directory, by name, its entries by the
/// name each is installed under. Sorted, so that a manifest does not depend
/// on how a file was laid out.
pub type Section = BTreeMap<String, BTreeMap<String, Entry>>;

/// A resources file, decoded.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "ResourceFileWire")]
pub struct ResourceFile {
    /// The pack's own directories, name to path, and any built-in one it
    /// keeps somewhere else.
    pub dirs: BTreeMap<String, String>,
    /// What both sides install.
    pub common: Section,
    pub client: Section,
    pub server: Section,
}

/// A file as it is written, before its lists are held to its directories.
#[derive(Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub(crate) struct ResourceFileWire {
    dirs: BTreeMap<String, String>,
    common: Section,
    client: Section,
    server: Section,
}

/// Whether a key can be the name of one file, or `.`, a folder's own place.
fn names_a_file(key: &str) -> bool {
    !key.is_empty() && key != ".." && !key.contains(['/', '\\'])
}

impl TryFrom<ResourceFileWire> for ResourceFile {
    type Error = ResourcesError;

    fn try_from(wire: ResourceFileWire) -> Result<Self, Self::Error> {
        // A path under no variable is relative to nothing an install knows.
        if let Some((name, path)) = wire.dirs.iter().find(|(_, path)| !path.starts_with("${")) {
            return Err(ResourcesError::BadDirPath {
                name: name.clone(),
                path: path.clone(),
            });
        }
        let sides = [
            ("common", &wire.common),
            ("client", &wire.client),
            ("server", &wire.server),
        ];
        // A list is named by a directory, and a misspelt one is not a new
        // directory: it is what was meant to be an old one.
        let known = |name: &str| BUILT_IN_DIRS.contains(&name) || wire.dirs.contains_key(name);
        if let Some(name) = sides
            .iter()
            .flat_map(|(_, section)| section.keys())
            .find(|name| !known(name))
        {
            return Err(ResourcesError::UnknownDir {
                name: name.clone(),
                known: BUILT_IN_DIRS
                    .iter()
                    .map(|dir| format!("`{dir}`"))
                    .collect::<Vec<_>>()
                    .join(", "),
            });
        }
        for (side, section) in sides {
            for (dir, entries) in section {
                if let Some(key) = entries.keys().find(|key| !names_a_file(key)) {
                    return Err(ResourcesError::BadKey {
                        dir: dir.clone(),
                        key: key.clone(),
                    });
                }
                // A side installs the common table with its own, so a key
                // in both is one path written twice.
                let shared = wire.common.get(dir).filter(|_| side != "common");
                if let Some(key) = entries
                    .keys()
                    .find(|key| shared.is_some_and(|common| common.contains_key(*key)))
                {
                    return Err(ResourcesError::ListedTwice {
                        dir: dir.clone(),
                        key: key.clone(),
                        side,
                    });
                }
            }
        }
        Ok(ResourceFile {
            dirs: wire.dirs,
            common: wire.common,
            client: wire.client,
            server: wire.server,
        })
    }
}

/// An entry with where it is listed: its directory's name, and its key.
pub struct Listed<'a> {
    pub dir: &'a str,
    pub key: &'a str,
    pub entry: &'a Entry,
}

impl Listed<'_> {
    /// What an error calls it: `mods.sodium`.
    pub fn label(&self) -> String {
        format!("{}.{}", self.dir, self.key)
    }
}

fn listed(section: &Section) -> impl Iterator<Item = Listed<'_>> {
    section.iter().flat_map(|(dir, entries)| {
        entries
            .iter()
            .map(move |(key, entry)| Listed { dir, key, entry })
    })
}

impl ResourceFile {
    /// What one side installs: the common table's, then the side's own.
    pub fn entries(&self, side: Side) -> impl Iterator<Item = Listed<'_>> {
        let own = match side {
            Side::Client => &self.client,
            Side::Server => &self.server,
        };
        listed(&self.common).chain(listed(own))
    }

    /// Where a directory is, for one side.
    ///
    /// A built-in one is under the game directory by its name, unless
    /// `[dirs]` moves it. A server has no game directory apart from its
    /// root, so `${game_directory}` is the root there: one file then serves
    /// both sides, and a directory that is elsewhere says `${root}` itself.
    pub fn dir_path(&self, name: &str, side: Side) -> String {
        let path = match self.dirs.get(name) {
            Some(path) => path.trim_end_matches('/').to_owned(),
            None => format!("${{game_directory}}/{name}"),
        };
        match side {
            Side::Client => path,
            Side::Server => path.replace("${game_directory}", "${root}"),
        }
    }
}

/// Decode a resources file. `path` is only what an error calls it.
pub fn parse_resources(text: &str, path: &str) -> Result<ResourceFile, ResourcesError> {
    toml::from_str(text).map_err(|source| ResourcesError::Toml {
        path: path.to_owned(),
        source: Box::new(source),
    })
}

/// Read and decode a resources file.
pub fn read_resources(path: &Path) -> Result<ResourceFile, ResourcesError> {
    let shown = path.display().to_string();
    let text = std::fs::read_to_string(path).map_err(|source| ResourcesError::Read {
        path: shown.clone(),
        source,
    })?;
    parse_resources(&text, &shown)
}
