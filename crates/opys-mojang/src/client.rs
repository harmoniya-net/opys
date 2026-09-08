//! Version-JSON client document.

use serde::{Deserialize, Serialize};

use crate::arguments::{Arguments, ArgumentsWire};
use crate::assets::AssetIndex;
use crate::downloads::Downloads;
use crate::error::MojangError;
use crate::java::JavaVersion;
use crate::libraries::{Libraries, LibraryWire};
use crate::logging::Logging;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientMetadata {
    #[serde(rename = "type")]
    pub kind: String,
    pub time: String,
    pub release_time: String,
    pub minimum_launcher_version: u32,
    pub assets: String,
    /// Absent on 1.6.x and its snapshots.
    #[serde(default)]
    pub compliance_level: u32,
}

/// A version JSON, in domain form.
///
/// Symmetric: the derived impls are each other's inverse, so a `Client` that
/// has crossed a boundary as JSON reads back as the same value. The version
/// JSON itself is a *different* shape — metadata spread across the top level,
/// the arguments field named two ways, libraries unflattened — and reading it
/// is [`Client::from_version_json`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Client {
    pub id: String,
    pub java: JavaVersion,
    pub asset_index: AssetIndex,
    pub downloads: Downloads,
    pub main_class: String,
    pub libraries: Libraries,
    pub args: Arguments,
    pub metadata: ClientMetadata,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub logging: Option<Logging>,
}

impl Client {
    /// Read a version JSON.
    pub fn from_version_json(raw: serde_json::Value) -> Result<Self, MojangError> {
        serde_json::from_value::<ClientWire>(raw)?.try_into()
    }
}

/// `javaVersion` is absent on 1.6.x and its snapshots, hence the default
/// rather than a required field. (`complianceLevel` defaults on
/// [`ClientMetadata`] itself.)
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClientWire {
    id: String,
    #[serde(default)]
    java_version: JavaVersion,
    asset_index: AssetIndex,
    downloads: Downloads,
    #[serde(default)]
    arguments: Option<ArgumentsWire>,
    #[serde(default)]
    minecraft_arguments: Option<ArgumentsWire>,
    main_class: String,
    #[serde(default)]
    logging: Option<Logging>,
    libraries: Vec<LibraryWire>,
    #[serde(flatten)]
    metadata: ClientMetadata,
}

impl TryFrom<ClientWire> for Client {
    type Error = MojangError;

    fn try_from(wire: ClientWire) -> Result<Self, Self::Error> {
        Ok(Client {
            id: wire.id,
            java: wire.java_version,
            asset_index: wire.asset_index,
            downloads: wire.downloads,
            main_class: wire.main_class,
            libraries: wire.libraries.try_into()?,
            args: wire
                .arguments
                .or(wire.minecraft_arguments)
                .ok_or(MojangError::MissingArguments)?
                .into(),
            metadata: wire.metadata,
            logging: wire.logging,
        })
    }
}
