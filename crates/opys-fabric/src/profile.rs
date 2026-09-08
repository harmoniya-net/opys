//! The Fabric launcher profile — Meta's `.../profile/json` document.
//!
//! Fabric's own spelling is close enough to name directly: `inheritsFrom`,
//! `mainClass` and `libraries` map field for field. Only `arguments` needs a
//! wire hop, because it arrives in the *version JSON* spelling that
//! [`Arguments::from_version_json`] reads and `Arguments`'s own `Deserialize`
//! deliberately does not.

use std::str::FromStr;

use opys_core::{Artifact, HashEntry, Integrity, Source};
use opys_dev::http::get_json;
use opys_mojang::{Arguments, MavenCoord, MojangError};
use serde::Deserialize;

use crate::error::FabricError;

/// A Fabric launcher-profile library: a Maven coordinate plus the repo base it
/// lives in. Newer Meta responses also ship per-file `sha1`/`size` — used for
/// artifact integrity when present, and simply absent when not.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct FabricLibrary {
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub sha1: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
}

/// A resolved launcher profile: what to inherit from, what to launch, and the
/// loader's own libraries.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(try_from = "FabricProfileWire")]
pub struct FabricProfile {
    /// The vanilla version this profile layers onto.
    pub inherits_from: String,
    pub main_class: String,
    /// The profile's argument delta, already in [`Arguments`] form. A profile
    /// with no `arguments` key contributes nothing rather than failing.
    pub arguments: Arguments,
    pub libraries: Vec<FabricLibrary>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FabricProfileWire {
    inherits_from: String,
    main_class: String,
    #[serde(default)]
    arguments: Option<serde_json::Value>,
    libraries: Vec<FabricLibrary>,
}

impl TryFrom<FabricProfileWire> for FabricProfile {
    type Error = MojangError;

    fn try_from(wire: FabricProfileWire) -> Result<Self, MojangError> {
        Ok(FabricProfile {
            inherits_from: wire.inherits_from,
            main_class: wire.main_class,
            arguments: match wire.arguments {
                Some(raw) => Arguments::from_version_json(raw)?,
                None => Arguments {
                    game: Vec::new(),
                    jvm: Vec::new(),
                    legacy: false,
                },
            },
            libraries: wire.libraries,
        })
    }
}

/// Fetch and parse a launcher profile.
pub fn fetch_profile(url: &str) -> Result<FabricProfile, FabricError> {
    Ok(get_json(url, &[])?)
}

/// A profile library as an artifact, paired with its `${library_directory}`-
/// relative path so the caller can put it on the classpath.
///
/// Profile libraries carry no rules and no natives — every entry is
/// unconditional, which is why nothing here consults a ruleset.
pub fn library_artifact(lib: &FabricLibrary) -> Result<(Artifact, String), FabricError> {
    let coord = MavenCoord::from_str(&lib.name)?;
    let path = coord
        .path()
        .ok_or_else(|| FabricError::UnversionedLibrary(lib.name.clone()))?;
    let url = format!("{}/{}", lib.url.trim_end_matches('/'), path);

    // A missing `sha1`/`size` is the common case on older Meta responses, and
    // an empty hash or a zero size is not a probe — `Artifact` leaves both
    // optional for exactly this "nothing to verify against" case.
    let artifact = Artifact {
        path: format!("${{library_directory}}/{path}"),
        source: Source::Url { url },
        size: lib.size.filter(|s| *s > 0),
        rules: Vec::new(),
        integrity: lib.sha1.as_deref().filter(|s| !s.is_empty()).map(|sha1| {
            Integrity::One(HashEntry::Sha1 {
                sha1: sha1.to_owned(),
            })
        }),
        discovery: None,
        metadata: None,
        extract: None,
    };
    Ok((artifact, path))
}
