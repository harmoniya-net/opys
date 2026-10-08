//! Behavioral tests for the two install guarantees a deployed launcher leans
//! on hardest:
//!
//!   1. **Integrity skip** — a present file whose hash still matches its
//!      manifest entry is *not* re-fetched; a present file whose hash no longer
//!      matches *is*. The probe is a blob kept where it cannot be read: if the
//!      installer wrongly re-fetches, the install fails.
//!
//!   2. **Cleanup** — after install, every `cleanup` rule is reconciled
//!      against the manifest: files it names are deleted, unless the manifest
//!      installed them; anything a rule does not name is left alone.

mod common;

use common::{blob, blob_file, blobs, serve, unreadable_blob};
use opys_runtime::{install, InstallOptions, InstallProgress, ManifestSource};
use serde_json::json;
use std::sync::{Arc, Mutex};
use tempfile::tempdir;

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
    let source = ManifestSource::Manifest {
        manifest: Box::new(manifest),
        blobs: blobs(),
    };
    install(source, opts).await.unwrap();
    Arc::try_unwrap(events).unwrap().into_inner().unwrap()
}

fn cleanup_removed(events: &[InstallProgress]) -> Option<u32> {
    events.iter().find_map(|e| match e {
        InstallProgress::Cleanup { removed } => Some(*removed),
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

/// A present file whose hash matches must be left untouched — the blob is
/// never read, and here it could not be.
#[tokio::test]
async fn matching_integrity_skips_refetch() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    std::fs::write(dir.path().join("keep.txt"), b"prior").unwrap();

    let events = run(json!({
        "vars": { "root": root },
        "artifacts": [{
            "path": "${root}/keep.txt",
            "source": { "blob": unreadable_blob("prior") }
        }]
    })
    .to_string())
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

    let events = run(json!({
        "vars": { "root": root },
        "artifacts": [{
            "path": "${root}/file.txt",
            "source": { "blob": blob("correct") }
        }]
    })
    .to_string())
    .await;

    let content = std::fs::read_to_string(dir.path().join("file.txt")).unwrap();
    assert_eq!(content, "correct", "stale file must be re-fetched");
    assert_eq!(
        download_skipped(&events),
        Some(0),
        "nothing should be skipped"
    );
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
            "source": { "blob": blob("aa") }
        }]
    })
    .to_string();

    // First install lays down the correct content.
    let first = run(manifest.clone()).await;
    assert_eq!(std::fs::read_to_string(dir.path().join("a")).unwrap(), "aa");
    assert_eq!(
        download_skipped(&first),
        Some(0),
        "fresh file is fetched, not skipped"
    );

    // Tamper with it on disk.
    std::fs::write(dir.path().join("a"), b"bb").unwrap();

    // Reinstall: the on-disk hash no longer matches → re-fetch → restored.
    let second = run(manifest).await;
    assert_eq!(
        std::fs::read_to_string(dir.path().join("a")).unwrap(),
        "aa",
        "tampered file is restored to the manifest content"
    );
    assert_eq!(
        download_skipped(&second),
        Some(0),
        "mismatch forces a re-fetch"
    );
}

/// The mirror image: an artifact with *no* integrity has nothing to check, so a
/// present file is trusted by path alone. Tampering survives a reinstall — the
/// file is never re-fetched.
#[tokio::test]
async fn reinstall_keeps_hashless_file_untouched() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    // Only a download can go without a hash: a blob's name is one.
    let base = serve(vec![("/a", b"aa".to_vec())]);
    let manifest = json!({
        "vars": { "root": root },
        "artifacts": [{
            "path": "${root}/a",
            "source": { "url": format!("{base}/a") }
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
    assert_eq!(
        download_skipped(&second),
        Some(1),
        "present file is skipped"
    );
}

/// A file that is *both* an artifact and named by a cleanup rule: its hash
/// changed (aa → bb) so install must re-fetch it, and being the manifest's it
/// must survive the cleanup rather than be deleted as a stray.
#[tokio::test]
async fn refetches_managed_file_named_by_cleanup() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    // On disk: the old content.
    std::fs::write(dir.path().join("config.txt"), b"aa").unwrap();

    run(json!({
        "vars": { "root": root },
        "cleanup": [{ "includes": ["${root}/config.txt"] }],
        "artifacts": [{
            "path": "${root}/config.txt",
            "source": { "blob": blob("bb") }
        }]
    })
    .to_string())
    .await;

    assert!(
        dir.path().join("config.txt").exists(),
        "managed file must not be removed"
    );
    assert_eq!(
        std::fs::read_to_string(dir.path().join("config.txt")).unwrap(),
        "bb",
        "hash changed (aa→bb) ⇒ re-fetched to the manifest content",
    );
}

// ── Cleanup ───────────────────────────────────────────────────────────────

/// The canonical case: a `mods/**` rule deletes a stray jar while keeping
/// the one the manifest installed.
#[tokio::test]
async fn cleanup_removes_strays_keeps_installed() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    let mods = dir.path().join("mods");
    std::fs::create_dir_all(&mods).unwrap();
    std::fs::write(mods.join("stray.jar"), b"stray").unwrap();

    let events = run(json!({
        "vars": { "root": root },
        "cleanup": [{ "includes": ["${root}/mods/**"] }],
        "artifacts": [{
            "path": "${root}/mods/keep.jar",
            "source": { "blob": blob("keep") }
        }]
    })
    .to_string())
    .await;

    assert!(mods.join("keep.jar").exists(), "managed jar must survive");
    assert!(
        !mods.join("stray.jar").exists(),
        "stray jar must be removed"
    );
    assert_eq!(cleanup_removed(&events), Some(1));
}

/// Files no rule names are never touched, even when the manifest did not install them.
#[tokio::test]
async fn cleanup_leaves_paths_no_rule_names() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    let mods = dir.path().join("mods");
    let config = dir.path().join("config");
    std::fs::create_dir_all(&mods).unwrap();
    std::fs::create_dir_all(&config).unwrap();
    std::fs::write(mods.join("stray.jar"), b"stray").unwrap();
    std::fs::write(config.join("user.cfg"), b"keep me").unwrap();

    run(json!({
        "vars": { "root": root },
        "cleanup": [{ "includes": ["${root}/mods/**"] }],
        "artifacts": [{
            "path": "${root}/mods/keep.jar",
            "source": { "blob": blob("keep") }
        }]
    })
    .to_string())
    .await;

    assert!(
        !mods.join("stray.jar").exists(),
        "stray under glob is removed"
    );
    assert!(
        config.join("user.cfg").exists(),
        "file outside glob is untouched"
    );
}

/// A managed file nested in a subdir survives; a sibling stray is removed and
/// its now-empty directory is pruned.
#[tokio::test]
async fn cleanup_keeps_nested_installed_and_removes_emptied_dirs() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    let sub = dir.path().join("mods/sub");
    let old = dir.path().join("mods/old");
    std::fs::create_dir_all(&sub).unwrap();
    std::fs::create_dir_all(&old).unwrap();
    std::fs::write(old.join("stray.jar"), b"stray").unwrap();

    run(json!({
        "vars": { "root": root },
        "cleanup": [{ "includes": ["${root}/mods/**"] }],
        "artifacts": [{
            "path": "${root}/mods/sub/keep.jar",
            "source": { "blob": blob("keep") }
        }]
    })
    .to_string())
    .await;

    assert!(sub.join("keep.jar").exists(), "nested managed jar survives");
    assert!(!old.join("stray.jar").exists(), "nested stray is removed");
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

/// A file an `extract` rule unpacked is the manifest's as much as an artifact
/// is. It used to be removed, which made "extract into a cleaned directory" a
/// way to install nothing.
#[tokio::test]
async fn cleanup_keeps_what_was_unpacked() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    let src = dir.path().join("bundle.tar");
    std::fs::write(&src, ustar("inner.jar", b"jar-bytes")).unwrap();
    std::fs::create_dir_all(dir.path().join("mods")).unwrap();
    std::fs::write(dir.path().join("mods/stray.jar"), b"stray").unwrap();

    run(json!({
        "vars": { "root": root },
        "cleanup": [{ "includes": ["${root}/mods/**"] }],
        "artifacts": [{
            "path": "${root}/cache/bundle.tar",
            "source": { "blob": blob_file(&src) },
            "extract": { "into": "${root}/mods" }
        }]
    })
    .to_string())
    .await;

    assert!(
        dir.path().join("mods/inner.jar").exists(),
        "unpacked file is kept"
    );
    assert!(
        !dir.path().join("mods/stray.jar").exists(),
        "stray is removed"
    );
}

/// Full lifecycle: a first install populates the managed files, a stray then
/// appears where the rule reaches, and re-running the *same* manifest removes
/// the stray while leaving the managed files in place.
#[tokio::test]
async fn reinstall_removes_stray_keeps_installed() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    let den = dir.path().join("dir");
    let manifest = json!({
        "vars": { "root": root },
        "cleanup": [{ "includes": ["${root}/dir/**/*"] }],
        "artifacts": [
            { "path": "${root}/dir/a", "source": { "blob": blob("a") } },
            { "path": "${root}/dir/b", "source": { "blob": blob("b") } }
        ]
    })
    .to_string();

    // First install: nothing on disk → both managed files land, nothing removed.
    let first = run(manifest.clone()).await;
    assert!(
        den.join("a").exists() && den.join("b").exists(),
        "managed files installed"
    );
    assert_eq!(
        cleanup_removed(&first),
        None,
        "nothing to remove on a clean install"
    );

    // A stray appears in scope.
    std::fs::write(den.join("c"), b"c").unwrap();

    // Re-install the same manifest: a/b are skipped (still present), c is removed.
    let second = run(manifest).await;
    assert!(den.join("a").exists(), "managed file a survives reinstall");
    assert!(den.join("b").exists(), "managed file b survives reinstall");
    assert!(!den.join("c").exists(), "stray c is removed on reinstall");
    assert_eq!(
        cleanup_removed(&second),
        Some(1),
        "exactly the stray is removed"
    );
}

/// Same lifecycle, but the stray appears in a *new subdirectory*. The reinstall
/// removes the nested file and the directory it left empty.
#[tokio::test]
async fn reinstall_removes_nested_stray_and_its_dir() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    let den = dir.path().join("dir");
    let manifest = json!({
        "vars": { "root": root },
        "cleanup": [{ "includes": ["${root}/dir/**/*"] }],
        "artifacts": [
            { "path": "${root}/dir/a", "source": { "blob": blob("a") } },
            { "path": "${root}/dir/b", "source": { "blob": blob("b") } }
        ]
    })
    .to_string();

    run(manifest.clone()).await;
    assert!(
        den.join("a").exists() && den.join("b").exists(),
        "managed files installed"
    );

    // A stray appears in a brand-new nested directory.
    std::fs::create_dir_all(den.join("subdir")).unwrap();
    std::fs::write(den.join("subdir/c"), b"c").unwrap();

    run(manifest).await;
    assert!(den.join("a").exists(), "managed file a survives reinstall");
    assert!(den.join("b").exists(), "managed file b survives reinstall");
    assert!(!den.join("subdir/c").exists(), "nested stray is removed");
    assert!(!den.join("subdir").exists(), "emptied directory is pruned");
}

/// Without `cleanup` rules, nothing is removed.
#[tokio::test]
async fn no_cleanup_means_nothing_removed() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    let mods = dir.path().join("mods");
    std::fs::create_dir_all(&mods).unwrap();
    std::fs::write(mods.join("stray.jar"), b"stray").unwrap();

    let events = run(json!({
        "vars": { "root": root },
        "artifacts": [{
            "path": "${root}/mods/keep.jar",
            "source": { "blob": blob("keep") }
        }]
    })
    .to_string())
    .await;

    assert!(mods.join("stray.jar").exists(), "no rule ⇒ stray is kept");
    assert_eq!(
        cleanup_removed(&events),
        None,
        "no cleanup event without a rule"
    );
}

/// The path-spelling defect: `game_directory` ends in `/`, so an artifact
/// written with `${root}` and a rule written with `${game_directory}` were
/// different strings for one file, and the file the manifest had just
/// installed was removed.
#[tokio::test]
async fn an_artifact_is_kept_however_the_rule_spells_its_directory() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();

    run(json!({
        "vars": { "root": root, "game_directory": "${root}/" },
        "cleanup": [{ "includes": ["${game_directory}/mods/*.jar"] }],
        "artifacts": [{
            "path": "${root}/mods/keep.jar",
            "source": { "blob": blob("keep") }
        }]
    })
    .to_string())
    .await;

    assert!(dir.path().join("mods/keep.jar").exists());
}

/// `excludes` spares what `includes` would take.
#[tokio::test]
async fn an_excluded_file_is_left_alone() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    let mods = dir.path().join("mods");
    std::fs::create_dir_all(&mods).unwrap();
    std::fs::write(mods.join("autogen.jar"), b"made by a mod").unwrap();
    std::fs::write(mods.join("stray.jar"), b"stray").unwrap();
    std::fs::write(mods.join("notes.txt"), b"not a jar").unwrap();

    run(json!({
        "vars": { "root": root },
        "cleanup": [{ "includes": ["${root}/mods/*.jar"], "excludes": ["*/autogen.jar"] }]
    })
    .to_string())
    .await;

    assert!(mods.join("autogen.jar").exists(), "excluded");
    assert!(mods.join("notes.txt").exists(), "not named");
    assert!(!mods.join("stray.jar").exists());
}

/// A directory a rule empties goes with its files: `logs/**` leaves no `logs`.
#[tokio::test]
async fn a_directory_left_empty_is_removed() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    let logs = dir.path().join("logs");
    std::fs::create_dir_all(logs.join("old")).unwrap();
    std::fs::write(logs.join("latest.log"), b"log").unwrap();
    std::fs::write(logs.join("old/1.log.gz"), b"log").unwrap();

    let events = run(json!({
        "vars": { "root": root },
        "cleanup": [{ "includes": ["${root}/logs/**"] }]
    })
    .to_string())
    .await;

    assert!(!logs.exists(), "the directory itself is gone");
    assert!(
        dir.path().exists(),
        "its parent is not the rule's to remove"
    );
    // Two files and two directories.
    assert_eq!(cleanup_removed(&events), Some(4));
}

/// A directory the last stray was removed from goes too, though the rule
/// names only files in it; one that was empty all along, and that no rule
/// names, stays.
#[tokio::test]
async fn only_a_directory_the_rule_emptied_or_names_is_removed() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    let mods = dir.path().join("mods");
    let saves = dir.path().join("saves");
    std::fs::create_dir_all(&mods).unwrap();
    std::fs::create_dir_all(&saves).unwrap();
    std::fs::write(mods.join("stray.jar"), b"stray").unwrap();

    run(json!({
        "vars": { "root": root },
        "cleanup": [{ "includes": ["${root}/*/*.jar"] }]
    })
    .to_string())
    .await;

    assert!(!mods.exists(), "emptied by the rule");
    assert!(saves.exists(), "empty before, and not named");
}

/// Dropping the game directories of earlier pack versions: every sibling
/// goes, saves and all, and the one excluded is not looked into.
#[tokio::test]
async fn earlier_game_directories_are_removed_and_the_current_one_is_not() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    for version in ["pack-1.0", "pack-1.1", "pack-1.2"] {
        let saves = dir.path().join(version).join("saves/world");
        std::fs::create_dir_all(&saves).unwrap();
        std::fs::write(saves.join("level.dat"), b"world").unwrap();
        std::fs::create_dir_all(dir.path().join(version).join("screenshots")).unwrap();
    }
    std::fs::write(dir.path().join("launcher.json"), b"{}").unwrap();

    run(json!({
        "vars": { "root": root, "game_directory": "${root}/pack-1.2/" },
        "cleanup": [{
            "includes": ["${root}/pack-*/**"],
            "excludes": ["${game_directory}/**"]
        }],
        "artifacts": [{
            "path": "${game_directory}/mods/a.jar",
            "source": { "blob": blob("a") }
        }]
    })
    .to_string())
    .await;

    assert!(!dir.path().join("pack-1.0").exists());
    assert!(!dir.path().join("pack-1.1").exists());
    let current = dir.path().join("pack-1.2");
    assert!(
        current.join("saves/world/level.dat").exists(),
        "the player's"
    );
    assert!(current.join("screenshots").exists(), "empty, and excluded");
    assert!(current.join("mods/a.jar").exists());
    assert!(dir.path().join("launcher.json").exists(), "not named");
}

/// A rule that cannot be trusted stops the install before it starts: nothing
/// is fetched, and nothing is removed.
#[tokio::test]
async fn a_rule_naming_an_undefined_variable_fails_before_anything_is_installed() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    std::fs::create_dir_all(dir.path().join("mods")).unwrap();
    std::fs::write(dir.path().join("mods/stray.jar"), b"stray").unwrap();

    let manifest = opys_core::parse_manifest(
        &json!({
            "vars": { "root": root },
            "cleanup": [
                { "includes": ["${root}/mods/**"] },
                { "includes": ["${game_dir}/logs/**"] }
            ],
            "artifacts": [{
                "path": "${root}/mods/keep.jar",
                "source": { "blob": blob("keep") }
            }]
        })
        .to_string(),
    )
    .unwrap();
    let error = install(
        ManifestSource::Manifest {
            manifest: Box::new(manifest),
            blobs: blobs(),
        },
        InstallOptions::new(),
    )
    .await
    .unwrap_err();

    assert!(
        matches!(error.report(), opys_runtime::ErrorReport::Manifest { .. }),
        "{error}"
    );
    assert!(error.to_string().contains("${game_dir}/logs/**"), "{error}");
    assert!(
        !dir.path().join("mods/keep.jar").exists(),
        "nothing fetched"
    );
    assert!(
        dir.path().join("mods/stray.jar").exists(),
        "nothing removed"
    );
}
