use indexmap::IndexMap;
use std::collections::HashSet;
use std::path::Path;
use opys_core::{
    artifact_applies, interpolate, parse_pointer_descriptor, Artifact, Manifest, OsOptions, Source,
};

use crate::errors::InstallError;
use crate::fetch::{fetch_with_retry, RetryOptions};
use crate::phases::verify::verify_integrity;

const MAX_POINTER_DEPTH: usize = 5;

pub struct PointerResolution {
    pub manifest: Manifest,
    pub refetch: HashSet<String>,
    pub resolved: u32,
}

async fn fetch_descriptor(url: &str) -> Result<opys_core::PointerDescriptor, InstallError> {
    let res = fetch_with_retry(reqwest::Method::GET, url, RetryOptions::default())
        .await
        .map_err(|e| InstallError::Network {
            url: url.to_owned(),
            status: 0,
            body: e.to_string(),
        })?;
    let status = res.status();
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(InstallError::Network {
            url: url.to_owned(),
            status: status.as_u16(),
            body: body.chars().take(200).collect(),
        });
    }
    let text = res.text().await.map_err(|e| InstallError::Network {
        url: url.to_owned(),
        status: 0,
        body: e.to_string(),
    })?;
    parse_pointer_descriptor(&text).map_err(InstallError::Other)
}

async fn follow(
    source: Source,
    vars: &IndexMap<String, String>,
) -> Result<(Source, Option<opys_core::Integrity>, Option<u64>), InstallError> {
    let mut current = source;
    let mut integrity: Option<opys_core::Integrity> = None;
    let mut size: Option<u64> = None;
    let mut depth = 0;
    loop {
        let Source::Pointer { pointer } = &current else {
            break;
        };
        if depth >= MAX_POINTER_DEPTH {
            return Err(InstallError::other(format!(
                "Pointer chain exceeded {MAX_POINTER_DEPTH} hops"
            )));
        }
        let url = interpolate(pointer, vars);
        let descriptor = fetch_descriptor(&url).await?;
        current = descriptor.source;
        integrity = descriptor.integrity;
        size = descriptor.size;
        depth += 1;
    }
    Ok((current, integrity, size))
}

pub async fn resolve_pointers(
    manifest: Manifest,
    vars: &IndexMap<String, String>,
    platform: &OsOptions,
) -> Result<PointerResolution, InstallError> {
    let mut refetch = HashSet::new();
    let mut resolved = 0u32;
    let mut new_artifacts = Vec::with_capacity(manifest.artifacts.len());

    for artifact in manifest.artifacts {
        if !matches!(artifact.source, Source::Pointer { .. })
            || !artifact_applies(&artifact, platform, &[])?
        {
            new_artifacts.push(artifact);
            continue;
        }
        resolved += 1;
        let (source, integ, size) = follow(artifact.source.clone(), vars).await?;
        let next = Artifact {
            source,
            integrity: integ.clone().or_else(|| artifact.integrity.clone()),
            size: size.or(artifact.size),
            ..artifact
        };
        let final_path = interpolate(&next.path, vars);
        if Path::new(&final_path).exists() {
            let fresh = match next.integrity.as_ref() {
                Some(i) => verify_integrity(&final_path, Some(i)).await,
                None => false,
            };
            if !fresh {
                refetch.insert(next.path.clone());
            }
        }
        new_artifacts.push(next);
    }

    let manifest = Manifest {
        artifacts: new_artifacts,
        ..manifest
    };
    Ok(PointerResolution {
        manifest,
        refetch,
        resolved,
    })
}
