use tokio::fs;
use opys_core::{parse_manifest, Manifest};

use crate::errors::InstallError;
use crate::fetch::{fetch_with_retry, RetryOptions};

/// Sources the install pipeline accepts.
pub enum ManifestSource<'a> {
    /// Already-decoded manifest in memory.
    Manifest(Box<Manifest>),
    /// Local filesystem path to a `opys.json`.
    Path(&'a str),
    /// HTTP(S) URL to a `opys.json`.
    Url(&'a str),
}

pub async fn resolve_manifest(source: ManifestSource<'_>) -> Result<Manifest, InstallError> {
    match source {
        ManifestSource::Manifest(m) => Ok(*m),
        ManifestSource::Path(p) => {
            let bytes = fs::read(p).await.map_err(|source| InstallError::Io {
                path: p.to_owned(),
                source,
            })?;
            let s = String::from_utf8(bytes).map_err(|e| {
                InstallError::Manifest(format!("manifest is not UTF-8: {e}"))
            })?;
            parse_manifest(&s).map_err(Into::into)
        }
        ManifestSource::Url(u) => {
            let res = fetch_with_retry(reqwest::Method::GET, u, RetryOptions::default())
                .await
                .map_err(|e| InstallError::Network {
                    url: u.to_owned(),
                    status: 0,
                    body: e.to_string(),
                })?;
            let status = res.status();
            if !status.is_success() {
                let body = res.text().await.unwrap_or_default();
                return Err(InstallError::Network {
                    url: u.to_owned(),
                    status: status.as_u16(),
                    body,
                });
            }
            let text = res.text().await.map_err(|e| InstallError::Network {
                url: u.to_owned(),
                status: 0,
                body: e.to_string(),
            })?;
            parse_manifest(&text).map_err(Into::into)
        }
    }
}
