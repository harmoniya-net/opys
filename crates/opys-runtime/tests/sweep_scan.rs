//! Behavioral tests for the two install guarantees a deployed launcher leans
//! on hardest:
//!
//!   1. **Integrity skip** — a present file whose hash still matches its
//!      manifest entry is *not* re-fetched; a present file whose hash no longer
//!      matches *is*. The probe is a `string` source whose content differs from
//!      what's already on disk: if the installer wrongly re-fetches, the bytes
//!      change and the assertion catches it.
//!
//!   2. **Restrict sweep** — after install, every `restrict` glob is reconciled
//!      against the manifest: unmanaged files under it are deleted, managed
//!      files (and anything outside the globs) are left alone.

use serde_json::json;
use std::sync::{Arc, Mutex};
use tempfile::tempdir;
use opys_runtime::{install, InstallOptions, InstallProgress, ManifestSource};

/// Hashes of the literal probe strings used below (`printf '…' | sha1sum`).
const SHA1_PRIOR: &str = "4a47653d5fc58fc62757c6b815e715ec77c8ee2e"; // "prior"
const SHA1_CORRECT: &str = "3179a65eff2523bbde53c99b299b719c10a35235"; // "correct"
const SHA1_AA: &str = "e0c9035898dd52fc65c41454cec9c4d2611bfb37"; // "aa"

async fn run(manifest_json: String) -> Vec<InstallProgress> {
    let events = Arc::new(Mutex::new(Vec::<InstallProgress>::new()));
    let cb = {
        let events = Arc::clone(&events);
        Arc::new(move |p: InstallProgress| events.lock().unwrap().push(p))
            as Arc<dyn Fn(InstallProgress) + Send + Sync>
    };
    let mut opts = InstallOptions::new();
    opts.on_progress = Some(cb);
    let manifest = opys_core::parse_manifest(&manifest_json).unwrap();
    install(ManifestSource::Manifest(manifest), opts).await.unwrap();
    Arc::try_unwrap(events).unwrap().into_inner().unwrap()
}

fn sweep_removed(events: &[InstallProgress]) -> Option<u32> {
    events.iter().find_map(|e| match e {
        InstallProgress::Sweep { removed } => Some(*removed),
        _ => None,
    })
}

fn download_skipped(events: &[InstallProgress]) -> Option<u32> {
    events.iter().rev().find_map(|e| match e {
        InstallProgress::Download { skipped, .. } => Some(*skipped),
        _ => None,
    })
}

// ── Integrity skip ────────────────────────────────────────────────────────

/// A present file whose hash matches must be left byte-for-byte untouched —
/// the differing `string` source must never overwrite it.
#[tokio::test]
async fn matching_integrity_skips_refetch() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    std::fs::write(dir.path().join("keep.txt"), b"prior").unwrap();

    let events = run(
        json!({
            "vars": { "root": root },
            "artifacts": [{
                "path": "${root}/keep.txt",
                "source": { "string": "REDOWNLOADED" },
                "integrity": { "sha1": SHA1_PRIOR }
            }]
        })
        .to_string(),
    )
    .await;

    let content = std::fs::read_to_string(dir.path().join("keep.txt")).unwrap();
    assert_eq!(content, "prior", "matching file must not be re-fetched");
    assert_eq!(download_skipped(&events), Some(1), "should report one skip");
}

/// A present file whose hash no longer matches must be re-fetched and replaced
/// with the manifest's content.
#[tokio::test]
async fn mismatched_integrity_triggers_refetch() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    std::fs::write(dir.path().join("file.txt"), b"corrupted").unwrap();

    let events = run(
        json!({
            "vars": { "root": root },
            "artifacts": [{
                "path": "${root}/file.txt",
                "source": { "string": "correct" },
                "integrity": { "sha1": SHA1_CORRECT }
            }]
        })
        .to_string(),
    )
    .await;

    let content = std::fs::read_to_string(dir.path().join("file.txt")).unwrap();
    assert_eq!(content, "correct", "stale file must be re-fetched");
    assert_eq!(download_skipped(&events), Some(0), "nothing should be skipped");
}

/// Full lifecycle: install writes the hashed file, the file is then tampered
/// with on disk, and re-running the *same* manifest detects the hash mismatch
/// and restores the manifest's content.
#[tokio::test]
async fn reinstall_restores_tampered_file() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    let manifest = json!({
        "vars": { "root": root },
        "artifacts": [{
            "path": "${root}/a",
            "source": { "string": "aa" },
            "integrity": { "sha1": SHA1_AA }
        }]
    })
    .to_string();

    // First install lays down the correct content.
    let first = run(manifest.clone()).await;
    assert_eq!(std::fs::read_to_string(dir.path().join("a")).unwrap(), "aa");
    assert_eq!(download_skipped(&first), Some(0), "fresh file is fetched, not skipped");

    // Tamper with it on disk.
    std::fs::write(dir.path().join("a"), b"bb").unwrap();

    // Reinstall: the on-disk hash no longer matches → re-fetch → restored.
    let second = run(manifest).await;
    assert_eq!(
        std::fs::read_to_string(dir.path().join("a")).unwrap(),
        "aa",
        "tampered file is restored to the manifest content"
    );
    assert_eq!(download_skipped(&second), Some(0), "mismatch forces a re-fetch");
}

/// The mirror image: an artifact with *no* integrity has nothing to check, so a
/// present file is trusted by path alone. Tampering survives a reinstall — the
/// file is never re-fetched.
#[tokio::test]
async fn reinstall_keeps_hashless_file_untouched() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    let manifest = json!({
        "vars": { "root": root },
        "artifacts": [{
            "path": "${root}/a",
            "source": { "string": "aa" }
        }]
    })
    .to_string();

    let first = run(manifest.clone()).await;
    assert_eq!(std::fs::read_to_string(dir.path().join("a")).unwrap(), "aa");
    assert_eq!(download_skipped(&first), Some(0), "fresh file is fetched");

    // Tamper with it on disk.
    std::fs::write(dir.path().join("a"), b"bb").unwrap();

    // Reinstall: no hash to verify → present file is skipped, tamper persists.
    let second = run(manifest).await;
    assert_eq!(
        std::fs::read_to_string(dir.path().join("a")).unwrap(),
        "bb",
        "hashless present file is trusted and left as-is"
    );
    assert_eq!(download_skipped(&second), Some(1), "present file is skipped");
}

// ── Restrict sweep ────────────────────────────────────────────────────────

/// The canonical case: a `mods/**` restrict deletes a stray jar while keeping
/// the managed one.
#[tokio::test]
async fn sweep_removes_unmanaged_keeps_managed() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    let mods = dir.path().join("mods");
    std::fs::create_dir_all(&mods).unwrap();
    std::fs::write(mods.join("stray.jar"), b"stray").unwrap();

    let events = run(
        json!({
            "vars": { "root": root },
            "restrict": ["${root}/mods/**"],
            "artifacts": [{
                "path": "${root}/mods/keep.jar",
                "source": { "string": "keep" }
            }]
        })
        .to_string(),
    )
    .await;

    assert!(mods.join("keep.jar").exists(), "managed jar must survive");
    assert!(!mods.join("stray.jar").exists(), "stray jar must be swept");
    assert_eq!(sweep_removed(&events), Some(1));
}

/// Files outside every restrict glob are never touched, even when unmanaged.
#[tokio::test]
async fn sweep_leaves_paths_outside_globs() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    let mods = dir.path().join("mods");
    let config = dir.path().join("config");
    std::fs::create_dir_all(&mods).unwrap();
    std::fs::create_dir_all(&config).unwrap();
    std::fs::write(mods.join("stray.jar"), b"stray").unwrap();
    std::fs::write(config.join("user.cfg"), b"keep me").unwrap();

    run(
        json!({
            "vars": { "root": root },
            "restrict": ["${root}/mods/**"],
            "artifacts": [{
                "path": "${root}/mods/keep.jar",
                "source": { "string": "keep" }
            }]
        })
        .to_string(),
    )
    .await;

    assert!(!mods.join("stray.jar").exists(), "stray under glob is swept");
    assert!(config.join("user.cfg").exists(), "file outside glob is untouched");
}

/// A managed file nested in a subdir survives; a sibling stray is removed and
/// its now-empty directory is pruned.
#[tokio::test]
async fn sweep_keeps_nested_managed_and_prunes_empty_dirs() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    let sub = dir.path().join("mods/sub");
    let old = dir.path().join("mods/old");
    std::fs::create_dir_all(&sub).unwrap();
    std::fs::create_dir_all(&old).unwrap();
    std::fs::write(old.join("stray.jar"), b"stray").unwrap();

    run(
        json!({
            "vars": { "root": root },
            "restrict": ["${root}/mods/**"],
            "artifacts": [{
                "path": "${root}/mods/sub/keep.jar",
                "source": { "string": "keep" }
            }]
        })
        .to_string(),
    )
    .await;

    assert!(sub.join("keep.jar").exists(), "nested managed jar survives");
    assert!(!old.join("stray.jar").exists(), "nested stray is swept");
    assert!(!old.exists(), "emptied directory is pruned");
    assert!(sub.exists(), "directory holding a managed file is kept");
}

/// Build a minimal single-file USTAR archive (header + content + two zero
/// blocks) so the extract tests need no archive dependency.
fn ustar(name: &str, content: &[u8]) -> Vec<u8> {
    let mut h = [0u8; 512];
    let nb = name.as_bytes();
    let n = nb.len().min(100);
    h[..n].copy_from_slice(&nb[..n]);
    h[100..108].copy_from_slice(b"0000644\0");
    h[108..116].copy_from_slice(b"0000000\0");
    h[116..124].copy_from_slice(b"0000000\0");
    h[124..136].copy_from_slice(format!("{:011o}\0", content.len()).as_bytes());
    h[136..148].copy_from_slice(b"00000000000\0");
    for b in &mut h[148..156] {
        *b = b' ';
    }
    h[156] = b'0';
    h[257..263].copy_from_slice(b"ustar\0");
    h[263..265].copy_from_slice(b"00");
    let sum: u32 = h.iter().map(|&b| b as u32).sum();
    h[148..156].copy_from_slice(format!("{sum:06o}\0 ").as_bytes());

    let mut out = h.to_vec();
    out.extend_from_slice(content);
    out.resize(out.len() + (512 - content.len() % 512) % 512, 0);
    out.resize(out.len() + 1024, 0);
    out
}

/// Accepted edge case: `restrict` is a literal "everything in scope that isn't
/// a manifest artifact gets dropped". Files unpacked by an `extract` rule aren't
/// artifacts, so a restrict over their target sweeps them too. Pins the agreed
/// behavior — don't extract into a restricted dir.
#[tokio::test]
async fn sweep_drops_extracted_files_in_scope() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    let src = dir.path().join("bundle.tar");
    std::fs::write(&src, ustar("inner.jar", b"jar-bytes")).unwrap();

    run(
        json!({
            "vars": { "root": root },
            "restrict": ["${root}/mods/**"],
            "artifacts": [{
                "path": "${root}/cache/bundle.tar",
                "source": { "file": src.to_string_lossy() },
                "extract": { "into": "${root}/mods" }
            }]
        })
        .to_string(),
    )
    .await;

    assert!(
        !dir.path().join("mods/inner.jar").exists(),
        "extracted file in a restricted dir is swept like any non-artifact"
    );
}

/// Full lifecycle: a first install populates the managed files, a stray then
/// appears in the restricted scope, and re-running the *same* manifest sweeps
/// the stray while leaving the managed files in place.
#[tokio::test]
async fn reinstall_sweeps_stray_keeps_managed() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    let den = dir.path().join("dir");
    let manifest = json!({
        "vars": { "root": root },
        "restrict": ["${root}/dir/**/*"],
        "artifacts": [
            { "path": "${root}/dir/a", "source": { "string": "a" } },
            { "path": "${root}/dir/b", "source": { "string": "b" } }
        ]
    })
    .to_string();

    // First install: nothing on disk → both managed files land, nothing swept.
    let first = run(manifest.clone()).await;
    assert!(den.join("a").exists() && den.join("b").exists(), "managed files installed");
    assert_eq!(sweep_removed(&first), None, "nothing to sweep on a clean install");

    // A stray appears in scope.
    std::fs::write(den.join("c"), b"c").unwrap();

    // Re-install the same manifest: a/b are skipped (still present), c is swept.
    let second = run(manifest).await;
    assert!(den.join("a").exists(), "managed file a survives reinstall");
    assert!(den.join("b").exists(), "managed file b survives reinstall");
    assert!(!den.join("c").exists(), "stray c is swept on reinstall");
    assert_eq!(sweep_removed(&second), Some(1), "exactly the stray is removed");
}

/// Same lifecycle, but the stray appears in a *new subdirectory*. The reinstall
/// sweeps the nested file and prunes the directory it left empty.
#[tokio::test]
async fn reinstall_sweeps_nested_stray_and_prunes_dir() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    let den = dir.path().join("dir");
    let manifest = json!({
        "vars": { "root": root },
        "restrict": ["${root}/dir/**/*"],
        "artifacts": [
            { "path": "${root}/dir/a", "source": { "string": "a" } },
            { "path": "${root}/dir/b", "source": { "string": "b" } }
        ]
    })
    .to_string();

    run(manifest.clone()).await;
    assert!(den.join("a").exists() && den.join("b").exists(), "managed files installed");

    // A stray appears in a brand-new nested directory.
    std::fs::create_dir_all(den.join("subdir")).unwrap();
    std::fs::write(den.join("subdir/c"), b"c").unwrap();

    run(manifest).await;
    assert!(den.join("a").exists(), "managed file a survives reinstall");
    assert!(den.join("b").exists(), "managed file b survives reinstall");
    assert!(!den.join("subdir/c").exists(), "nested stray is swept");
    assert!(!den.join("subdir").exists(), "emptied directory is pruned");
}

/// Without a `restrict` list, nothing is swept — unmanaged files stay put.
#[tokio::test]
async fn no_restrict_means_no_sweep() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    let mods = dir.path().join("mods");
    std::fs::create_dir_all(&mods).unwrap();
    std::fs::write(mods.join("stray.jar"), b"stray").unwrap();

    let events = run(
        json!({
            "vars": { "root": root },
            "artifacts": [{
                "path": "${root}/mods/keep.jar",
                "source": { "string": "keep" }
            }]
        })
        .to_string(),
    )
    .await;

    assert!(mods.join("stray.jar").exists(), "no restrict ⇒ stray is kept");
    assert_eq!(sweep_removed(&events), None, "no sweep event without restrict");
}
