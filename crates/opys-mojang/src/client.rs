//! Version-JSON client document.

use serde::{Deserialize, Serialize};

use crate::arguments::Arguments;
use crate::assets::AssetIndex;
use crate::downloads::Downloads;
use crate::error::MojangError;
use crate::java::JavaVersion;
use crate::libraries::Libraries;
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

/// The wire spreads the metadata fields across the top level and names the
/// arguments field two different ways; the domain nests the former and
/// resolves the latter. Hence the asymmetry — `try_from` for reading,
/// the derived impl for writing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", try_from = "ClientWire")]
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

/// `javaVersion` is absent on 1.6.x and its snapshots, hence the default
/// rather than a required field. (`complianceLevel` defaults on
/// [`ClientMetadata`] itself.)
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClientWire {
    id: String,
    #[serde(default)]
    java_version: JavaVersion,
    asset_index: AssetIndex,
    downloads: Downloads,
    #[serde(default)]
    arguments: Option<Arguments>,
    #[serde(default)]
    minecraft_arguments: Option<Arguments>,
    main_class: String,
    #[serde(default)]
    logging: Option<Logging>,
    libraries: Libraries,
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
            libraries: wire.libraries,
            args: wire
                .arguments
                .or(wire.minecraft_arguments)
                .ok_or(MojangError::MissingArguments)?,
            metadata: wire.metadata,
            logging: wire.logging,
        })
    }
}
