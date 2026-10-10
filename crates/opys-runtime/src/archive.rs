//! Zip/tar dispatch + extract rules (pick, scan, dump).
//!
//! An archive is read from disk an entry at a time and each entry goes
//! straight to the file it becomes, so memory does not grow with the
//! archive. It used to be read whole, and then decoded whole, before the
//! first entry was written: a JDK cost its archive and twice its contents in
//! memory, and picking one file out of an archive decoded all of it. The zip
//! and tar readers block, so an extraction is one blocking task.
//!
//! The price is that a damaged archive is found where the damage is, with
//! the entries ahead of it already written. Nothing depends on those: the
//! install fails, and unpacking runs again on the next one.
//!
//! `matches_glob` is the tiny dialect local to `extract`-rule
//! includes/excludes — NOT the same as `core::glob`, which `cleanup` rules
//! are written in (frozen — don't unify).

use std::fs::{self, File};
use std::io::{self, BufReader, Read};
use std::path::{Path, PathBuf};

/// What an entry holds. Directories and everything a tar has besides files
/// and symbolic links — hard links, devices — are never handed over.
enum Body<'a> {
    /// `mode` is a tar's. A zip entry's is ignored.
    File {
        content: &'a mut dyn Read,
        mode: Option<u32>,
    },
    Symlink {
        target: String,
    },
}

/// Whether to go on to the next entry.
enum Next {
    Entry,
    Stop,
}

fn invalid(error: impl Into<Box<dyn std::error::Error + Send + Sync>>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, error)
}

fn is_tar_path(path: &str) -> bool {
    path.ends_with(".tar.gz") || path.ends_with(".tgz") || path.ends_with(".tar")
}

/// Hand `visit` each entry of the archive at `archive_path`, in the order
/// the archive holds them. An entry `visit` does not read is skipped: at no
/// cost in a zip, which is sought, and by decoding past it in a tar.
fn each_entry(
    archive_path: &str,
    mut visit: impl FnMut(&str, Body<'_>) -> io::Result<Next>,
) -> io::Result<()> {
    let file = BufReader::new(File::open(archive_path)?);
    if !is_tar_path(archive_path) {
        let mut archive = zip::ZipArchive::new(file).map_err(invalid)?;
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(invalid)?;
            let name = entry.name().to_owned();
            if name.ends_with('/') {
                continue;
            }
            let body = Body::File {
                content: &mut entry,
                mode: None,
            };
            if let Next::Stop = visit(&name, body)? {
                break;
            }
        }
        return Ok(());
    }

    let reader: Box<dyn Read> = if archive_path.ends_with(".tar") {
        Box::new(file)
    } else {
        Box::new(flate2::read::GzDecoder::new(file))
    };
    // USTAR `prefix`, GNU long names and PAX headers are the `tar` crate's.
    let mut archive = tar::Archive::new(reader);
    for entry in archive.entries()? {
        let mut entry = entry?;
        let kind = entry.header().entry_type();
        let name = entry.path()?.to_string_lossy().replace('\\', "/");
        let body = if kind.is_symlink() {
            let target = entry
                .link_name()
                .ok()
                .flatten()
                .map(|path| path.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            Body::Symlink { target }
        } else if kind.is_file() {
            let mode = entry.header().mode().unwrap_or(0);
            Body::File {
                content: &mut entry,
                mode: Some(mode),
            }
        } else {
            continue;
        };
        if let Next::Stop = visit(&name, body)? {
            break;
        }
    }
    Ok(())
}

/// Strip `pattern` off the front of `name`, if present.
///   `*<suffix>` → strip up through the first occurrence of `<suffix>`,
///                 whatever precedes it — e.g. `"*/"` drops an archive's
///                 top-level directory regardless of its literal name (the
///                 common case for JDK-style archives whose internal
///                 directory embeds a build number unknowable at resolve
///                 time, e.g. GraalVM CE).
///   else        → literal prefix match.
fn strip_one<'a>(name: &'a str, pattern: &str) -> Option<&'a str> {
    match pattern.strip_prefix('*') {
        Some(suffix) => {
            let idx = name.find(suffix)?;
            Some(&name[idx + suffix.len()..])
        }
        None => name.strip_prefix(pattern),
    }
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

/// Where an entry named `out_name` lands under `dest_dir`, or a refusal.
///
/// An archive is somebody else's file — a modpack's overrides are whatever
/// its author zipped — and an entry's name is the only thing in it that says
/// where to write. So a name may only walk down: one that is absolute, or
/// climbs with `..`, is refused rather than followed, and so is one that
/// passes through a symlink, since a tar can plant a link in one entry and
/// write through it in the next. Refused, not skipped: an archive that tries
/// this is not one to install the rest of.
fn entry_dest(dest_dir: &Path, out_name: &str) -> io::Result<PathBuf> {
    use std::path::Component;
    let refuse = |why: &str| invalid(format!("archive entry '{out_name}' {why}"));
    let mut dest = dest_dir.to_path_buf();
    let mut parts = Path::new(out_name).components().peekable();
    while let Some(part) = parts.next() {
        match part {
            Component::Normal(name) => dest.push(name),
            Component::CurDir => continue,
            _ => {
                return Err(refuse(
                    "names a path outside the directory it is extracted into",
                ))
            }
        }
        // Every directory on the way down, not the entry itself: replacing a
        // link an earlier extraction left is what `create_symlink` is for.
        if parts.peek().is_some() {
            if let Ok(meta) = fs::symlink_metadata(&dest) {
                if meta.file_type().is_symlink() {
                    return Err(refuse("is written through a symbolic link"));
                }
            }
        }
    }
    Ok(dest)
}

/// Whether a link at `out_name` pointing to `target` stays in the directory
/// the archive is extracted into. A link is a path like an entry's name, and
/// held to the same rule: [`entry_dest`] refuses to write *through* a link,
/// but a link that points out is a door left for whatever writes next, an
/// artifact of the same manifest included. Told from the text, since the
/// target need not exist yet: a JDK's `legal/java.xml/COPYRIGHT` points at
/// `../java.base/COPYRIGHT`, which is in, and an absolute target never is.
///
/// A target may climb only at its front. There the text is true: a link is
/// never created through another link, so the directories above it are real
/// and each `..` is one of them. Past a name it is not, because the name may
/// be a link: with `sub/b -> ..` in place, `sub/b/../..` reads as staying in
/// and is the directory above the whole extraction.
fn link_stays_inside(out_name: &str, target: &str) -> bool {
    use std::path::Component;
    let normal = |path: &str| {
        Path::new(path)
            .components()
            .filter(|part| matches!(part, Component::Normal(_)))
            .count()
    };
    // How far below the directory the link's own directory is.
    let mut depth = normal(out_name).saturating_sub(1);
    let mut descended = false;
    for part in Path::new(target).components() {
        match part {
            Component::Normal(_) => descended = true,
            Component::CurDir => {}
            Component::ParentDir if depth > 0 && !descended => depth -= 1,
            _ => return false,
        }
    }
    true
}

/// Write a file's content to `dest`, as it is read.
fn write_file(content: &mut dyn Read, mode: Option<u32>, dest: &Path) -> io::Result<()> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut file = File::create(dest)?;
    io::copy(content, &mut file)?;
    apply_mode(dest, mode)
}

/// Write one entry and say where it went.
fn write_entry(body: Body<'_>, dest_dir: &Path, out_name: &str) -> io::Result<PathBuf> {
    let dest = entry_dest(dest_dir, out_name)?;
    match body {
        Body::File { content, mode } => write_file(content, mode, &dest)?,
        Body::Symlink { target } => {
            if !link_stays_inside(out_name, &target) {
                return Err(invalid(format!(
                    "archive entry '{out_name}' is a link to '{target}', \
                     outside the directory it is extracted into"
                )));
            }
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent)?;
            }
            create_symlink(&target, &dest)?;
        }
    }
    Ok(dest)
}

#[cfg(unix)]
fn apply_mode(path: &Path, mode: Option<u32>) -> io::Result<()> {
    if let Some(mode) = mode {
        if mode & 0o111 != 0 {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(path, fs::Permissions::from_mode(mode & 0o777))?;
        }
    }
    Ok(())
}

#[cfg(not(unix))]
fn apply_mode(_path: &Path, _mode: Option<u32>) -> io::Result<()> {
    Ok(())
}

#[cfg(unix)]
fn create_symlink(target: &str, dest: &Path) -> io::Result<()> {
    // Re-extraction re-creates symlinks left by a prior run — `symlink()`
    // doesn't overwrite like a file write does, so the stale link (or file)
    // at `dest` must be cleared first.
    match fs::remove_file(dest) {
        Err(err) if err.kind() != io::ErrorKind::NotFound => return Err(err),
        _ => {}
    }
    // Permission-denied is a silent skip (non-admin Windows-style guard).
    match std::os::unix::fs::symlink(target, dest) {
        Err(err) if err.kind() != io::ErrorKind::PermissionDenied => Err(err),
        _ => Ok(()),
    }
}

#[cfg(windows)]
fn create_symlink(_target: &str, _dest: &Path) -> io::Result<()> {
    // On Windows, non-admin users can't symlink — best-effort silent skip.
    Ok(())
}

/// Run `work` off the async threads: everything here blocks on a disk.
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> io::Result<T> + Send + 'static,
) -> io::Result<T> {
    tokio::task::spawn_blocking(work)
        .await
        .map_err(io::Error::other)?
}

/// Where the entry `name` goes under the rules, or `None` when they leave
/// it out.
fn placed(
    name: &str,
    includes: Option<&[String]>,
    excludes: Option<&[String]>,
    strip_prefixes: Option<&[String]>,
) -> Option<String> {
    if includes.is_some_and(|globs| !globs.iter().any(|glob| matches_glob(name, glob))) {
        return None;
    }
    if excludes.is_some_and(|globs| globs.iter().any(|glob| matches_glob(name, glob))) {
        return None;
    }
    let Some(prefixes) = strip_prefixes else {
        return Some(name.to_owned());
    };
    let stripped = prefixes
        .iter()
        .find_map(|prefix| strip_one(name, prefix))
        .unwrap_or(name);
    (!stripped.is_empty()).then(|| stripped.to_owned())
}

/// Extract entries from `archive_path` into `target_dir`, applying include/
/// exclude globs and optional path-prefix stripping. Returns every path
/// written, which is what makes an unpacked file the manifest's own when
/// `cleanup` runs.
pub async fn extract_archive(
    archive_path: &str,
    target_dir: &Path,
    includes: Option<&[String]>,
    excludes: Option<&[String]>,
    strip_prefixes: Option<&[String]>,
) -> io::Result<Vec<PathBuf>> {
    let archive_path = archive_path.to_owned();
    let target_dir = target_dir.to_owned();
    let (includes, excludes, strip_prefixes) = (
        includes.map(<[String]>::to_vec),
        excludes.map(<[String]>::to_vec),
        strip_prefixes.map(<[String]>::to_vec),
    );
    blocking(move || {
        let mut written = Vec::new();
        each_entry(&archive_path, |name, body| {
            let out_name = placed(
                name,
                includes.as_deref(),
                excludes.as_deref(),
                strip_prefixes.as_deref(),
            );
            if let Some(out_name) = out_name {
                written.push(write_entry(body, &target_dir, &out_name)?);
            }
            Ok(Next::Entry)
        })?;
        Ok(written)
    })
    .await
}

/// Extract a single named entry to a destination file. Reading stops at the
/// entry: nothing after it is decoded.
pub async fn extract_archive_pick(
    archive_path: &str,
    entry_name: &str,
    dest_path: &Path,
) -> io::Result<()> {
    let archive_path = archive_path.to_owned();
    let entry_name = entry_name.to_owned();
    let dest_path = dest_path.to_owned();
    blocking(move || {
        let mut found = false;
        each_entry(&archive_path, |name, body| match body {
            Body::File { content, mode } if name == entry_name => {
                write_file(content, mode, &dest_path)?;
                found = true;
                Ok(Next::Stop)
            }
            _ => Ok(Next::Entry),
        })?;
        if found {
            Ok(())
        } else {
            Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("Archive {archive_path} has no file entry '{entry_name}'"),
            ))
        }
    })
    .await
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::io::Write;

    /// Builds an in-memory tar with one regular file and one symlink entry.
    fn tar_with_symlink() -> Vec<u8> {
        let mut builder = tar::Builder::new(Vec::new());

        let mut file_header = tar::Header::new_gnu();
        file_header.set_path("payload.txt").unwrap();
        file_header.set_size(5);
        file_header.set_mode(0o644);
        file_header.set_cksum();
        builder.append(&file_header, &b"hello"[..]).unwrap();

        let mut link_header = tar::Header::new_gnu();
        link_header.set_entry_type(tar::EntryType::Symlink);
        link_header.set_path("link.txt").unwrap();
        link_header.set_link_name("payload.txt").unwrap();
        link_header.set_size(0);
        link_header.set_cksum();
        builder.append(&link_header, &[][..]).unwrap();

        builder.into_inner().unwrap()
    }

    fn zip_with(names: &[&str]) -> Vec<u8> {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for name in names {
            zip.start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(b"hello").unwrap();
        }
        zip.finish().unwrap().into_inner()
    }

    /// An entry's name is the archive author's, and the archive is not ours.
    /// One that climbs out of the directory, or is absolute, stops the
    /// extraction and writes nothing where it pointed.
    #[tokio::test]
    async fn an_entry_that_leaves_the_directory_is_refused() {
        for name in ["../escape.txt", "a/../../escape.txt", "/escape.txt"] {
            let dir = tempfile::tempdir().unwrap();
            let into = dir.path().join("into");
            let archive_path = dir.path().join("bundle.zip");
            std::fs::write(&archive_path, zip_with(&["ok.txt", name])).unwrap();

            let err = extract_archive(archive_path.to_str().unwrap(), &into, None, None, None)
                .await
                .unwrap_err();

            assert_eq!(err.kind(), std::io::ErrorKind::InvalidData, "{name}");
            assert!(!dir.path().join("escape.txt").exists(), "{name}");
        }
    }

    /// A tar can plant a link and then name a file beneath it. Following it
    /// is the same escape with one more step.
    #[tokio::test]
    async fn an_entry_written_through_a_symlink_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let outside = dir.path().join("outside");
        std::fs::create_dir(&outside).unwrap();
        let into = dir.path().join("into");

        let mut builder = tar::Builder::new(Vec::new());
        let mut link = tar::Header::new_gnu();
        link.set_entry_type(tar::EntryType::Symlink);
        link.set_path("door").unwrap();
        link.set_link_name(&outside).unwrap();
        link.set_size(0);
        link.set_cksum();
        builder.append(&link, &[][..]).unwrap();
        let mut file = tar::Header::new_gnu();
        file.set_path("door/escape.txt").unwrap();
        file.set_size(5);
        file.set_mode(0o644);
        file.set_cksum();
        builder.append(&file, &b"hello"[..]).unwrap();
        let archive_path = dir.path().join("bundle.tar");
        std::fs::write(&archive_path, builder.into_inner().unwrap()).unwrap();

        let err = extract_archive(archive_path.to_str().unwrap(), &into, None, None, None)
            .await
            .unwrap_err();

        assert_eq!(err.kind(), std::io::ErrorKind::InvalidData);
        assert!(!outside.join("escape.txt").exists());
    }

    #[test]
    fn a_link_may_point_anywhere_in_its_own_directory() {
        assert!(link_stays_inside("link.txt", "payload.txt"));
        assert!(link_stays_inside(
            "legal/java.xml/COPYRIGHT",
            "../java.base/COPYRIGHT"
        ));
        assert!(link_stays_inside("a/b/link", "../../top.txt"));
        assert!(link_stays_inside("bin", "./jdk/Contents/Home/bin"));

        assert!(!link_stays_inside("link", ".."));
        assert!(!link_stays_inside("a/link", "../../outside"));
        assert!(!link_stays_inside("a/link", "b/../../../outside"));
        // `b` may itself be a link, and then `b/..` is not where it reads.
        assert!(!link_stays_inside("a", "sub/b/.."));
        assert!(!link_stays_inside("a/link", "b/../c"));
        assert!(!link_stays_inside("link", "/etc"));
    }

    /// Nothing is written through this link by the archive that carries it,
    /// so only the link itself can be refused.
    #[tokio::test]
    async fn a_link_that_points_out_of_the_directory_is_refused() {
        for target in ["/etc", "../outside"] {
            let dir = tempfile::tempdir().unwrap();
            let into = dir.path().join("into");
            let mut builder = tar::Builder::new(Vec::new());
            let mut link = tar::Header::new_gnu();
            link.set_entry_type(tar::EntryType::Symlink);
            link.set_path("door").unwrap();
            link.set_link_name(target).unwrap();
            link.set_size(0);
            link.set_cksum();
            builder.append(&link, &[][..]).unwrap();
            let archive_path = dir.path().join("bundle.tar");
            std::fs::write(&archive_path, builder.into_inner().unwrap()).unwrap();

            let err = extract_archive(archive_path.to_str().unwrap(), &into, None, None, None)
                .await
                .unwrap_err();

            assert_eq!(err.kind(), std::io::ErrorKind::InvalidData, "{target}");
            assert!(
                std::fs::symlink_metadata(into.join("door")).is_err(),
                "{target}"
            );
        }
    }

    /// Two links, each of which reads as staying in. Followed, the second
    /// is two directories above the extraction.
    #[tokio::test]
    async fn links_cannot_be_chained_into_a_way_out() {
        let dir = tempfile::tempdir().unwrap();
        let into = dir.path().join("a/into");
        let mut builder = tar::Builder::new(Vec::new());
        for (name, target) in [("sub/b", ".."), ("door", "sub/b/../..")] {
            let mut link = tar::Header::new_gnu();
            link.set_entry_type(tar::EntryType::Symlink);
            link.set_path(name).unwrap();
            link.set_link_name(target).unwrap();
            link.set_size(0);
            link.set_cksum();
            builder.append(&link, &[][..]).unwrap();
        }
        let archive_path = dir.path().join("bundle.tar");
        std::fs::write(&archive_path, builder.into_inner().unwrap()).unwrap();

        let err = extract_archive(archive_path.to_str().unwrap(), &into, None, None, None)
            .await
            .unwrap_err();

        assert_eq!(err.kind(), std::io::ErrorKind::InvalidData);
        assert!(std::fs::symlink_metadata(into.join("door")).is_err());
    }

    /// Re-extracting the same archive into the same directory must not fail
    /// with "File exists" — install now re-extracts on every launch, so a
    /// symlink entry has to overwrite the link left by the prior run instead
    /// of erroring like a bare `symlink()` syscall would.
    #[tokio::test]
    async fn extract_archive_is_idempotent_for_symlinks() {
        let dir = tempfile::tempdir().unwrap();
        let archive_path = dir.path().join("bundle.tar");
        std::fs::File::create(&archive_path)
            .unwrap()
            .write_all(&tar_with_symlink())
            .unwrap();
        let archive_path = archive_path.to_str().unwrap();

        extract_archive(archive_path, dir.path(), None, None, None)
            .await
            .unwrap();
        extract_archive(archive_path, dir.path(), None, None, None)
            .await
            .expect("re-extraction must overwrite the existing symlink, not error");

        let link = dir.path().join("link.txt");
        assert_eq!(std::fs::read_link(&link).unwrap(), Path::new("payload.txt"));
        assert_eq!(
            std::fs::read_to_string(dir.path().join("payload.txt")).unwrap(),
            "hello"
        );
    }

    fn tar_of(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut builder = tar::Builder::new(Vec::new());
        for (name, content) in entries {
            let mut header = tar::Header::new_gnu();
            header.set_path(name).unwrap();
            header.set_size(content.len() as u64);
            header.set_mode(0o755);
            header.set_cksum();
            builder.append(&header, *content).unwrap();
        }
        builder.into_inner().unwrap()
    }

    fn gzipped(data: &[u8]) -> Vec<u8> {
        let mut gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        gz.write_all(data).unwrap();
        gz.finish().unwrap()
    }

    /// The three spellings of an archive hold the same entries, and each is
    /// read the same way: filtered by name, stripped, written, and reported.
    #[tokio::test]
    async fn every_kind_of_archive_is_unpacked_alike() {
        let entries: [(&str, &[u8]); 3] = [
            ("top/bin/java", b"java"),
            ("top/lib/a.so", b"lib"),
            ("top/README", b"read"),
        ];
        let tar = tar_of(&entries);
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        zip.add_directory("top/", zip::write::SimpleFileOptions::default())
            .unwrap();
        for (name, content) in entries {
            zip.start_file(name, zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(content).unwrap();
        }
        let zip = zip.finish().unwrap().into_inner();

        for (file, data) in [
            ("a.tar", tar.clone()),
            ("a.tar.gz", gzipped(&tar)),
            ("a.tgz", gzipped(&tar)),
            ("a.zip", zip),
        ] {
            let dir = tempfile::tempdir().unwrap();
            let into = dir.path().join("into");
            let archive_path = dir.path().join(file);
            std::fs::write(&archive_path, data).unwrap();

            let mut written = extract_archive(
                archive_path.to_str().unwrap(),
                &into,
                Some(&["top/*".to_owned()]),
                Some(&["*README".to_owned()]),
                Some(&["*/".to_owned()]),
            )
            .await
            .unwrap();
            written.sort();

            assert_eq!(
                written,
                [into.join("bin/java"), into.join("lib/a.so")],
                "{file}"
            );
            assert_eq!(
                std::fs::read(into.join("bin/java")).unwrap(),
                b"java",
                "{file}"
            );
            assert!(!into.join("README").exists(), "{file}");
        }
    }

    /// A picked entry is found by its whole name, written where it is told
    /// to go, and whatever follows it in the archive is never decoded.
    #[tokio::test]
    async fn a_pick_takes_one_entry_and_reads_no_further() {
        let tar = tar_of(&[("a/one.txt", b"one"), ("a/two.txt", b"two")]);
        // Cut short inside the second entry: reading on would fail.
        let cut = &tar[..512 + 512 + 512 + 1];
        let dir = tempfile::tempdir().unwrap();
        let archive_path = dir.path().join("a.tar");
        std::fs::write(&archive_path, cut).unwrap();
        let archive = archive_path.to_str().unwrap();

        let dest = dir.path().join("out/picked.txt");
        extract_archive_pick(archive, "a/one.txt", &dest)
            .await
            .unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), b"one");
    }

    #[tokio::test]
    async fn a_pick_of_an_entry_that_is_not_there_says_so() {
        let dir = tempfile::tempdir().unwrap();
        let archive_path = dir.path().join("a.zip");
        std::fs::write(&archive_path, zip_with(&["a.txt"])).unwrap();
        let dest = dir.path().join("picked.txt");

        let err = extract_archive_pick(archive_path.to_str().unwrap(), "b.txt", &dest)
            .await
            .unwrap_err();

        assert_eq!(err.kind(), std::io::ErrorKind::NotFound);
        assert!(err.to_string().contains("'b.txt'"));
        assert!(!dest.exists());
    }

    #[test]
    fn strip_one_literal_prefix_matches_current_behaviour() {
        assert_eq!(strip_one("maven/foo.jar", "maven/"), Some("foo.jar"));
        assert_eq!(strip_one("overrides/config.txt", "maven/"), None);
    }

    #[test]
    fn strip_one_glob_strips_an_unknown_leading_segment() {
        // The literal top-level dir name (a build number unknowable ahead of
        // time, e.g. GraalVM CE's `graalvm-community-openjdk-21.0.2+13.1`)
        // is irrelevant — `"*/"` strips up through the first `/` regardless.
        assert_eq!(
            strip_one("graalvm-community-openjdk-21.0.2+13.1/bin/java", "*/"),
            Some("bin/java"),
        );
        assert_eq!(strip_one("anything-at-all/x", "*/"), Some("x"));
        // No `/` in the name at all → no match.
        assert_eq!(strip_one("no-slash-here", "*/"), None);
    }

    /// Extracting a tar whose entries all share one unpredictable top-level
    /// directory, with `strip: ["*/"]`, must land the contents flat under
    /// the target dir — the real-world shape of a GraalVM CE archive.
    #[tokio::test]
    async fn extract_archive_glob_strip_flattens_an_unknown_top_dir() {
        let mut builder = tar::Builder::new(Vec::new());
        let mut header = tar::Header::new_gnu();
        header
            .set_path("graalvm-community-openjdk-21.0.2+13.1/bin/java")
            .unwrap();
        header.set_size(5);
        header.set_mode(0o755);
        header.set_cksum();
        builder.append(&header, &b"hello"[..]).unwrap();
        let data = builder.into_inner().unwrap();

        let dir = tempfile::tempdir().unwrap();
        let archive_path = dir.path().join("bundle.tar");
        std::fs::File::create(&archive_path)
            .unwrap()
            .write_all(&data)
            .unwrap();
        let archive_path = archive_path.to_str().unwrap();

        let strip = vec!["*/".to_string()];
        extract_archive(archive_path, dir.path(), None, None, Some(&strip))
            .await
            .unwrap();

        assert_eq!(
            std::fs::read_to_string(dir.path().join("bin/java")).unwrap(),
            "hello",
        );
        assert!(!dir
            .path()
            .join("graalvm-community-openjdk-21.0.2+13.1")
            .exists());
    }
}
