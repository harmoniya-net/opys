//! Zip/tar dispatch + extract rules (pick, scan, dump).
//!
//! Mirrors `runtime/lib/archive.ts`. `matches_glob` is the tiny dialect
//! local to `extract`-rule includes/excludes — NOT the same as `core::glob`'s
//! `restrict` semantics (frozen — don't unify).

use std::io::{Cursor, Read};
use std::path::Path;
use tokio::fs;
use tokio::io::AsyncWriteExt;

use crate::tar_reader::{is_tar_path, read_tar_archive, TarEntry};

#[derive(Debug, Clone)]
pub struct NormalizedEntry {
    pub name: String,
    pub kind: EntryKind,
    pub content: Option<Vec<u8>>,
    pub link_target: Option<String>,
    pub mode: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EntryKind {
    File,
    Symlink,
}

/// Match an archive entry name against an extract-rule pattern.
///   `pattern/` or `pattern/*` → prefix match (subtree)
///   `pattern*`               → starts-with
///   `*pattern`               → ends-with
///   else                     → exact
pub fn matches_glob(name: &str, pattern: &str) -> bool {
    if pattern.ends_with("/*") || pattern.ends_with('/') {
        let prefix = if pattern.ends_with("/*") {
            &pattern[..pattern.len() - 1]
        } else {
            pattern
        };
        return name.starts_with(prefix);
    }
    if let Some(prefix) = pattern.strip_suffix('*') {
        return name.starts_with(prefix);
    }
    if let Some(suffix) = pattern.strip_prefix('*') {
        return name.ends_with(suffix);
    }
    name == pattern
}

pub fn read_archive_sync(archive_path: &str, data: &[u8]) -> std::io::Result<Vec<NormalizedEntry>> {
    if is_tar_path(archive_path) {
        let entries = read_tar_archive(archive_path, data)?;
        return Ok(entries.into_iter().map(to_normalized).collect());
    }
    // Zip.
    let mut archive = zip::ZipArchive::new(Cursor::new(data))
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    let mut out = Vec::with_capacity(archive.len());
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        let name = file.name().to_owned();
        if name.ends_with('/') {
            continue;
        }
        let mut content = Vec::with_capacity(file.size() as usize);
        file.read_to_end(&mut content)?;
        out.push(NormalizedEntry {
            name,
            kind: EntryKind::File,
            content: Some(content),
            link_target: None,
            mode: None,
        });
    }
    Ok(out)
}

fn to_normalized(entry: TarEntry) -> NormalizedEntry {
    match entry {
        TarEntry::File {
            name,
            content,
            mode,
        } => NormalizedEntry {
            name,
            kind: EntryKind::File,
            content: Some(content),
            link_target: None,
            mode: Some(mode),
        },
        TarEntry::Symlink { name, link_target } => NormalizedEntry {
            name,
            kind: EntryKind::Symlink,
            content: None,
            link_target: Some(link_target),
            mode: None,
        },
    }
}

async fn write_entry(
    entry: &NormalizedEntry,
    dest_dir: &Path,
    out_name: &str,
) -> std::io::Result<()> {
    let dest = dest_dir.join(out_name);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).await?;
    }
    match entry.kind {
        EntryKind::File => {
            let mut f = fs::File::create(&dest).await?;
            if let Some(content) = entry.content.as_deref() {
                f.write_all(content).await?;
            }
            f.flush().await?;
            apply_mode(&dest, entry.mode).await?;
        }
        EntryKind::Symlink => {
            let target = entry.link_target.clone().unwrap_or_default();
            create_symlink(&target, &dest).await?;
        }
    }
    Ok(())
}

#[cfg(unix)]
async fn apply_mode(path: &Path, mode: Option<u32>) -> std::io::Result<()> {
    if let Some(mode) = mode {
        if mode & 0o111 != 0 {
            use std::os::unix::fs::PermissionsExt;
            let perms = std::fs::Permissions::from_mode(mode & 0o777);
            fs::set_permissions(path, perms).await?;
        }
    }
    Ok(())
}

#[cfg(not(unix))]
async fn apply_mode(_path: &Path, _mode: Option<u32>) -> std::io::Result<()> {
    Ok(())
}

#[cfg(unix)]
async fn create_symlink(target: &str, dest: &Path) -> std::io::Result<()> {
    // Permission-denied is a silent skip (non-admin Windows-style guard).
    match tokio::fs::symlink(target, dest).await {
        Err(err) if err.kind() != std::io::ErrorKind::PermissionDenied => Err(err),
        _ => Ok(()),
    }
}

#[cfg(windows)]
async fn create_symlink(_target: &str, _dest: &Path) -> std::io::Result<()> {
    // On Windows, non-admin users can't symlink — best-effort silent skip.
    Ok(())
}

/// Read an archive off-thread (zip/tar both pull the whole thing into memory).
async fn read_normalized(archive_path: &str) -> std::io::Result<Vec<NormalizedEntry>> {
    let data = fs::read(archive_path).await?;
    let path = archive_path.to_owned();
    tokio::task::spawn_blocking(move || read_archive_sync(&path, &data))
        .await
        .map_err(std::io::Error::other)?
}

/// Extract entries from `archive_path` into `target_dir`, applying include/
/// exclude globs and optional path-prefix stripping. The archive is read
/// into memory once.
pub async fn extract_archive(
    archive_path: &str,
    target_dir: &Path,
    includes: Option<&[String]>,
    excludes: Option<&[String]>,
    strip_prefixes: Option<&[String]>,
) -> std::io::Result<()> {
    let entries = read_normalized(archive_path).await?;
    for entry in entries {
        if let Some(inc) = includes {
            if !inc.iter().any(|p| matches_glob(&entry.name, p)) {
                continue;
            }
        }
        if let Some(exc) = excludes {
            if exc.iter().any(|p| matches_glob(&entry.name, p)) {
                continue;
            }
        }
        let mut out_name = entry.name.clone();
        if let Some(prefixes) = strip_prefixes {
            for p in prefixes {
                if let Some(rest) = out_name.strip_prefix(p) {
                    out_name = rest.to_owned();
                    break;
                }
            }
            if out_name.is_empty() {
                continue;
            }
        }
        write_entry(&entry, target_dir, &out_name).await?;
    }
    Ok(())
}

/// Extract a single named entry to a destination file.
pub async fn extract_archive_pick(
    archive_path: &str,
    entry_name: &str,
    dest_path: &Path,
) -> std::io::Result<()> {
    let entries = read_normalized(archive_path).await?;
    let found = entries
        .iter()
        .find(|e| e.name == entry_name && e.kind == EntryKind::File)
        .ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("Archive {archive_path} has no file entry '{entry_name}'"),
            )
        })?;

    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).await?;
    }
    let mut f = fs::File::create(dest_path).await?;
    if let Some(content) = found.content.as_deref() {
        f.write_all(content).await?;
    }
    f.flush().await?;
    apply_mode(dest_path, found.mode).await?;
    Ok(())
}
