//! Tar reader — supports regular files, symlinks, USTAR `prefix`, GNU long
//! names, PAX extended (all via the `tar` crate). Other entry types skipped.
//!
//! Mirrors `runtime/lib/tar.ts`.

use std::io::{Cursor, Read};

#[derive(Debug, Clone)]
pub enum TarEntry {
    File {
        name: String,
        content: Vec<u8>,
        mode: u32,
    },
    Symlink {
        name: String,
        link_target: String,
    },
}

pub fn is_tar_path(path: &str) -> bool {
    path.ends_with(".tar.gz") || path.ends_with(".tgz") || path.ends_with(".tar")
}

pub fn read_tar_archive(path: &str, data: &[u8]) -> std::io::Result<Vec<TarEntry>> {
    if path.ends_with(".tar.gz") || path.ends_with(".tgz") {
        let mut gz = flate2::read::GzDecoder::new(Cursor::new(data));
        let mut buf = Vec::with_capacity(data.len() * 2);
        gz.read_to_end(&mut buf)?;
        read_tar(&buf)
    } else {
        read_tar(data)
    }
}

pub fn read_tar(data: &[u8]) -> std::io::Result<Vec<TarEntry>> {
    let mut archive = tar::Archive::new(Cursor::new(data));
    let mut out = Vec::new();
    for entry in archive.entries()? {
        let mut entry = entry?;
        let header = entry.header().clone();
        let entry_type = header.entry_type();

        if entry_type.is_symlink() {
            let name = path_to_string(&entry.path()?);
            let link_target = entry
                .link_name()
                .ok()
                .flatten()
                .map(|p| path_to_string(&p))
                .unwrap_or_default();
            out.push(TarEntry::Symlink { name, link_target });
            continue;
        }

        if entry_type.is_file() {
            let name = path_to_string(&entry.path()?);
            let mode = header.mode().unwrap_or(0);
            let mut buf = Vec::with_capacity(header.size().unwrap_or(0) as usize);
            entry.read_to_end(&mut buf)?;
            out.push(TarEntry::File {
                name,
                content: buf,
                mode,
            });
            continue;
        }
        // Directories and other types: skip (drain happens implicitly).
    }
    Ok(out)
}

fn path_to_string(p: &std::path::Path) -> String {
    p.to_string_lossy().replace('\\', "/")
}
