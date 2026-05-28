use base64::Engine;
use indexmap::IndexMap;
use regex::Regex;
use std::collections::HashSet;
use std::path::Path;
use lanka_core::{
    artifact_applies, interpolate, Artifact, Discovery, HashAlgo, HashEntry, HashRef, Manifest,
    OsOptions, Source,
};

use crate::errors::InstallError;
use crate::fetch::{client, fetch_with_retry, RetryOptions, LANKA_USER_AGENT};
use crate::phases::verify::verify_integrity;

pub struct DiscoveryResolution {
    pub manifest: Manifest,
    pub refetch: HashSet<String>,
}

fn hash_entry(algo: HashAlgo, hex: String) -> HashEntry {
    match algo {
        HashAlgo::Sha256 => HashEntry::Sha256 { sha256: hex },
        HashAlgo::Sha1 => HashEntry::Sha1 { sha1: hex },
        HashAlgo::Md5 => HashEntry::Md5 { md5: hex },
    }
}

fn url_filename(u: &str) -> String {
    if let Ok(url) = reqwest::Url::parse(u) {
        if let Some(seg) = url.path_segments().and_then(|mut s| s.next_back()) {
            return seg.to_owned();
        }
    }
    Path::new(u)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Pull a hash of `algo` out of an arbitrary text blob — header value or
/// checksum-file body. Tolerates `sha256sum`-style and RFC 9530 base64.
fn extract_hash(blob: &str, algo: HashAlgo, filename: Option<&str>) -> Option<String> {
    let len = algo.hex_len();
    let named: Vec<&str> = match filename {
        Some(f) => blob.lines().filter(|l| l.contains(f)).collect(),
        None => Vec::new(),
    };
    let lines: Vec<&str> = if named.is_empty() {
        vec![blob]
    } else {
        named
    };
    let hex_re = Regex::new(&format!(r"\b[0-9a-fA-F]{{{len}}}\b")).unwrap();
    let b64_re = Regex::new(r"[A-Za-z0-9+/_-]{20,}={0,2}").unwrap();
    for text in lines {
        if let Some(m) = hex_re.find(text) {
            return Some(m.as_str().to_lowercase());
        }
        for token in b64_re.find_iter(text) {
            let s = token.as_str().replace('-', "+").replace('_', "/");
            if let Ok(buf) = base64::engine::general_purpose::STANDARD.decode(&s) {
                if buf.len() * 2 == len {
                    return Some(hex::encode(buf));
                }
            }
        }
    }
    None
}

async fn discover(
    artifact_url: &str,
    spec: &Discovery,
    vars: &IndexMap<String, String>,
) -> Result<(Option<HashEntry>, Option<u64>), InstallError> {
    let need_head = spec.integrity.as_ref().and_then(|i| i.header.as_ref()).is_some()
        || spec.size.as_ref().and_then(|s| s.header.as_ref()).is_some();
    let mut headers: Option<reqwest::header::HeaderMap> = None;
    if need_head {
        let res = client()
            .head(artifact_url)
            .header("user-agent", LANKA_USER_AGENT)
            .send()
            .await
            .map_err(|e| InstallError::Network {
                url: artifact_url.to_owned(),
                status: 0,
                body: e.to_string(),
            })?;
        if !res.status().is_success() {
            return Err(InstallError::Network {
                url: artifact_url.to_owned(),
                status: res.status().as_u16(),
                body: String::new(),
            });
        }
        headers = Some(res.headers().clone());
    }

    let mut integrity: Option<HashEntry> = None;
    if let Some(ip) = &spec.integrity {
        if let Some(h) = &ip.header {
            let algo = h.algo();
            let header_name = h.location();
            let value = headers
                .as_ref()
                .and_then(|hh| hh.get(header_name))
                .and_then(|v| v.to_str().ok());
            if let Some(v) = value {
                if let Some(hex) = extract_hash(v, algo, None) {
                    integrity = Some(hash_entry(algo, hex));
                }
            }
        }
        if integrity.is_none() {
            if let Some(u) = &ip.url {
                let algo = u.algo();
                let mut url_vars = vars.clone();
                url_vars.insert("url".into(), artifact_url.to_owned());
                let probe_url = interpolate(u.location(), &url_vars);
                let res = fetch_with_retry(reqwest::Method::GET, &probe_url, RetryOptions::default())
                    .await
                    .map_err(|e| InstallError::Network {
                        url: probe_url.clone(),
                        status: 0,
                        body: e.to_string(),
                    })?;
                if !res.status().is_success() {
                    return Err(InstallError::Network {
                        url: probe_url,
                        status: res.status().as_u16(),
                        body: String::new(),
                    });
                }
                let body = res.text().await.unwrap_or_default();
                let fname = url_filename(artifact_url);
                let fname_opt = if fname.is_empty() { None } else { Some(fname.as_str()) };
                if let Some(hex) = extract_hash(&body, algo, fname_opt) {
                    integrity = Some(hash_entry(algo, hex));
                }
            }
        }
        if spec.integrity.is_some() && integrity.is_none() {
            return Err(InstallError::other(format!(
                "Could not discover an integrity hash for {artifact_url}"
            )));
        }
    }

    let mut size: Option<u64> = None;
    if let Some(sp) = &spec.size {
        if let Some(name) = &sp.header {
            if let Some(hh) = &headers {
                if let Some(v) = hh.get(name).and_then(|v| v.to_str().ok()) {
                    if let Ok(n) = v.parse::<u64>() {
                        size = Some(n);
                    }
                }
            }
        }
    }

    let _ = HashRef::Sha1 { sha1: String::new() }; // silence unused-import warning for HashRef
    Ok((integrity, size))
}

pub async fn resolve_discovery(
    manifest: Manifest,
    vars: &IndexMap<String, String>,
    platform: &OsOptions,
) -> Result<DiscoveryResolution, InstallError> {
    let mut refetch = HashSet::new();
    let mut new_artifacts = Vec::with_capacity(manifest.artifacts.len());

    for artifact in manifest.artifacts {
        let spec = artifact.discovery.clone();
        if spec.is_none() || !artifact_applies(&artifact, platform, &[])? {
            new_artifacts.push(artifact);
            continue;
        }
        if !matches!(artifact.source, Source::Url { .. }) {
            return Err(InstallError::other(format!(
                "discovery on \"{}\" requires a url source",
                artifact.path
            )));
        }
        let url_template = match &artifact.source {
            Source::Url { url } => url.clone(),
            _ => unreachable!(),
        };
        let artifact_url = interpolate(&url_template, vars);
        let (integrity, size) = discover(&artifact_url, spec.as_ref().unwrap(), vars).await?;
        let next = Artifact {
            integrity: integrity.clone().map(lanka_core::Integrity::One).or_else(|| artifact.integrity.clone()),
            size: size.or(artifact.size),
            ..artifact
        };
        if let Some(integ) = &next.integrity {
            let final_path = interpolate(&next.path, vars);
            if Path::new(&final_path).exists() {
                let fresh = verify_integrity(&final_path, Some(integ)).await;
                if !fresh {
                    refetch.insert(next.path.clone());
                }
            }
        }
        new_artifacts.push(next);
    }

    Ok(DiscoveryResolution {
        manifest: Manifest {
            artifacts: new_artifacts,
            ..manifest
        },
        refetch,
    })
}
