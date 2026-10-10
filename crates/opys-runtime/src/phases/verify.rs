use md5::Md5;
use opys_core::{Artifact, HashEntry, Integrity};
use sha1::Sha1;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Read;

/// One running hash per kind the entries ask for, fed by a single read.
#[derive(Default)]
struct Hashers {
    sha1: Option<Sha1>,
    sha256: Option<Sha256>,
    md5: Option<Md5>,
}

impl Hashers {
    fn of(entries: &[HashEntry]) -> Hashers {
        let mut hashers = Hashers::default();
        for entry in entries {
            match entry {
                HashEntry::Sha1 { .. } => hashers.sha1 = Some(Sha1::new()),
                HashEntry::Sha256 { .. } => hashers.sha256 = Some(Sha256::new()),
                HashEntry::Md5 { .. } => hashers.md5 = Some(Md5::new()),
            }
        }
        hashers
    }

    fn update(&mut self, data: &[u8]) {
        if let Some(hasher) = &mut self.sha1 {
            hasher.update(data);
        }
        if let Some(hasher) = &mut self.sha256 {
            hasher.update(data);
        }
        if let Some(hasher) = &mut self.md5 {
            hasher.update(data);
        }
    }

    /// Whether any entry is the hash of what was read.
    fn matches(self, entries: &[HashEntry]) -> bool {
        let sha1 = self.sha1.map(|hasher| hex::encode(hasher.finalize()));
        let sha256 = self.sha256.map(|hasher| hex::encode(hasher.finalize()));
        let md5 = self.md5.map(|hasher| hex::encode(hasher.finalize()));
        entries.iter().any(|entry| {
            let computed = match entry {
                HashEntry::Sha1 { .. } => &sha1,
                HashEntry::Sha256 { .. } => &sha256,
                HashEntry::Md5 { .. } => &md5,
            };
            computed
                .as_deref()
                .is_some_and(|hex| hex.eq_ignore_ascii_case(entry.hex()))
        })
    }
}

/// Hash the file at `path` as it is read, a buffer at a time. It was read
/// whole first, which made checking a JDK's archive cost its size in
/// memory, eight of them at once when a scan re-checks what is installed.
fn file_matches(path: &str, entries: &[HashEntry]) -> bool {
    let Ok(mut file) = File::open(path) else {
        return false;
    };
    let mut hashers = Hashers::of(entries);
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        match file.read(&mut buffer) {
            Ok(0) => return hashers.matches(entries),
            Ok(read) => hashers.update(&buffer[..read]),
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => {}
            Err(_) => return false,
        }
    }
}

pub async fn verify_integrity(path: &str, integrity: Option<&Integrity>) -> bool {
    let entries = integrity.map(Integrity::entries).unwrap_or(&[]);
    if entries.is_empty() {
        return true;
    }
    // Reading and hashing both block, so neither is done on an async thread.
    let (path, entries) = (path.to_owned(), entries.to_vec());
    tokio::task::spawn_blocking(move || file_matches(&path, &entries))
        .await
        .unwrap_or(false)
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
