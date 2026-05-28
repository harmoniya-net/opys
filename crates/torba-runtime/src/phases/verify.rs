use md5::Md5;
use sha1::Sha1;
use sha2::{Digest, Sha256};
use tokio::fs;
use torba_core::{Artifact, HashEntry, Integrity};

fn check_hash(data: &[u8], entry: &HashEntry) -> bool {
    let computed = match entry {
        HashEntry::Sha1 { .. } => {
            let mut h = Sha1::new();
            h.update(data);
            hex::encode(h.finalize())
        }
        HashEntry::Sha256 { .. } => {
            let mut h = Sha256::new();
            h.update(data);
            hex::encode(h.finalize())
        }
        HashEntry::Md5 { .. } => {
            let mut h = Md5::new();
            h.update(data);
            hex::encode(h.finalize())
        }
    };
    computed.eq_ignore_ascii_case(entry.hex())
}

pub async fn verify_integrity(path: &str, integrity: Option<&Integrity>) -> bool {
    let entries = integrity.map(Integrity::entries).unwrap_or(&[]);
    if entries.is_empty() {
        return true;
    }
    let Ok(data) = fs::read(path).await else {
        return false;
    };
    entries.iter().any(|e| check_hash(&data, e))
}

pub async fn verify_all<'a>(
    tasks: impl IntoIterator<Item = (&'a str, &'a Artifact)>,
) -> Vec<String> {
    let mut failures = Vec::new();
    for (path, artifact) in tasks {
        if !verify_integrity(path, artifact.integrity.as_ref()).await {
            failures.push(path.to_owned());
        }
    }
    failures
}
