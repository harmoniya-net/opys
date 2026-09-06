use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DownloadsFile {
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

/// Mojang sends these keys snake_case (`client_mappings`), while the opys
/// domain shape exposes them camelCase — hence the split rename. The TS
/// original declared only the camelCase spelling, so `zod` never matched the
/// wire keys and silently dropped every field but `client`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct Downloads {
    pub client: DownloadsFile,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_mappings: Option<DownloadsFile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server: Option<DownloadsFile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub windows_server: Option<DownloadsFile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_mappings: Option<DownloadsFile>,
}
