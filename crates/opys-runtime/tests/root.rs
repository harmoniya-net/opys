//! An install stays in its root. Each case tries one way out through a real
//! install and looks at what is on disk afterwards: a refusal that came
//! after the write would be no refusal.

mod common;

use opys_core::{parse_manifest, OsOptions, VarMap};
use opys_runtime::{
    build_launch, install, prepare, InstallError, InstallOptions, LaunchOptions, ManifestSource,
};
use serde_json::{json, Value};
use std::path::Path;
use tempfile::tempdir;

use common::{blob, bundled};

fn source(manifest: Value) -> ManifestSource {
    bundled(&parse_manifest(&manifest.to_string()).unwrap())
}

/// The message of the refusal an install of `manifest` ends in.
async fn refused(manifest: Value) -> String {
    match install(source(manifest), InstallOptions::new()).await {
        Err(InstallError::Manifest(message)) => message,
        other => panic!("expected the manifest to be refused, got {other:?}"),
    }
}

fn text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// A tar of one entry, `name`, holding `content`.
fn tar_of(name: &str, content: &[u8]) -> Vec<u8> {
    let mut builder = tar::Builder::new(Vec::new());
    let mut header = tar::Header::new_gnu();
    header.set_path(name).unwrap();
    header.set_size(content.len() as u64);
    header.set_mode(0o644);
    header.set_cksum();
    builder.append(&header, content).unwrap();
    builder.into_inner().unwrap()
}

fn blob_bytes(dir: &Path, name: &str, bytes: &[u8]) -> String {
    let path = dir.join(name);
    std::fs::write(&path, bytes).unwrap();
    common::blob_file(&path)
}

#[tokio::test]
async fn an_artifact_outside_the_root_is_refused_and_nothing_is_written() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("game");
    let outside = dir.path().join("outside.txt");

    for path in [
        text(&outside),
        "${root}/../outside.txt".to_owned(),
        "${root}/mods/../../outside.txt".to_owned(),
        // Relative: wherever the process happens to be standing.
        "outside.txt".to_owned(),
        // The root is a directory.
        "${root}".to_owned(),
    ] {
        let message = refused(json!({
            "vars": { "root": text(&root) },
            "artifacts": [
                { "path": "${root}/ok.txt", "source": { "blob": blob("ok") } },
                { "path": path, "source": { "blob": blob("out") } }
            ]
        }))
        .await;
        assert!(message.contains("outside the root"), "{path}: {message}");
        assert!(message.contains(&path), "{path}: {message}");
        assert!(!outside.exists(), "{path}");
        // Refused whole: the artifact beside it was not installed either.
        assert!(!root.exists(), "{path}");
    }
}

#[tokio::test]
async fn an_archive_is_not_unpacked_outside_the_root() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("game");
    let outside = dir.path().join("outside");
    let archive = blob_bytes(dir.path(), "a.tar", &tar_of("escape.txt", b"hello"));

    for rule in [
        json!({ "into": text(&outside) }),
        json!({ "into": "${root}/.." }),
        json!({ "matches": "*", "into": "${root}/../outside" }),
        json!({ "file": "escape.txt", "into": "${root}/../outside/escape.txt" }),
        // A picked file is a file, and the root is a directory.
        json!({ "file": "escape.txt", "into": "${root}" }),
    ] {
        let message = refused(json!({
            "vars": { "root": text(&root) },
            "artifacts": [{
                "path": "${root}/a.tar",
                "source": { "blob": archive },
                "extract": rule
            }]
        }))
        .await;
        assert!(message.contains("outside the root"), "{rule}: {message}");
        assert!(!outside.exists(), "{rule}");
        assert!(!dir.path().join("escape.txt").exists(), "{rule}");
        assert!(!root.exists(), "{rule}");
    }
}

/// `clean` empties a directory before unpacking into it, which is the one
/// place an install deletes without a `cleanup` rule.
#[tokio::test]
async fn clean_empties_nothing_outside_the_root_and_never_the_root() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("game");
    let precious = dir.path().join("precious");
    std::fs::create_dir_all(&precious).unwrap();
    std::fs::write(precious.join("save.dat"), "mine").unwrap();
    std::fs::create_dir_all(&root).unwrap();
    std::fs::write(root.join("options.txt"), "mine").unwrap();
    let archive = blob_bytes(dir.path(), "a.tar", &tar_of("x.txt", b"hello"));

    for into in [
        text(&precious),
        "${root}/../precious".to_owned(),
        "${root}/".to_owned(),
    ] {
        let message = refused(json!({
            "vars": { "root": text(&root) },
            "artifacts": [{
                "path": "${root}/a.tar",
                "source": { "blob": archive },
                "extract": { "into": into, "clean": true }
            }]
        }))
        .await;
        assert!(message.contains("outside the root"), "{into}: {message}");
        assert!(precious.join("save.dat").exists(), "{into}");
        assert!(root.join("options.txt").exists(), "{into}");
    }
}

#[tokio::test]
async fn cleanup_names_nothing_outside_the_root() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("game");
    let precious = dir.path().join("precious");
    std::fs::create_dir_all(&precious).unwrap();
    std::fs::write(precious.join("save.dat"), "mine").unwrap();

    let message = refused(json!({
        "vars": { "root": text(&root) },
        "artifacts": [{ "path": "${root}/ok.txt", "source": { "blob": blob("ok") } }],
        "cleanup": [{ "includes": [format!("{}/**", text(&precious))] }]
    }))
    .await;
    assert!(message.contains("outside the root"), "{message}");
    assert!(precious.join("save.dat").exists());
    assert!(!root.exists());
}

/// A link is the two-step way out: one artifact plants it, the next is
/// written through it at a path that reads as inside.
#[cfg(unix)]
#[tokio::test]
async fn an_archive_cannot_plant_a_link_for_another_artifact_to_follow() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("game");
    let outside = dir.path().join("outside");
    std::fs::create_dir_all(&outside).unwrap();

    let mut builder = tar::Builder::new(Vec::new());
    let mut link = tar::Header::new_gnu();
    link.set_entry_type(tar::EntryType::Symlink);
    link.set_path("door").unwrap();
    link.set_link_name(&outside).unwrap();
    link.set_size(0);
    link.set_cksum();
    builder.append(&link, &[][..]).unwrap();
    let archive = blob_bytes(dir.path(), "a.tar", &builder.into_inner().unwrap());

    let result = install(
        source(json!({
            "vars": { "root": text(&root) },
            "artifacts": [{
                "path": "${root}/a.tar",
                "source": { "blob": archive },
                "extract": { "matches": "*", "into": "${root}/mods" }
            }]
        })),
        InstallOptions::new(),
    )
    .await;

    assert!(
        matches!(result, Err(InstallError::Extraction { .. })),
        "{result:?}"
    );
    assert!(std::fs::symlink_metadata(root.join("mods/door")).is_err());
}

#[tokio::test]
async fn the_callers_root_is_the_root_whatever_the_manifest_says() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("game");
    let elsewhere = dir.path().join("elsewhere");

    let mut options = InstallOptions::new();
    options.vars = Some(VarMap::from([("root".to_owned(), text(&root))]));
    install(
        source(json!({
            "vars": { "root": text(&elsewhere) },
            "artifacts": [{ "path": "${root}/ok.txt", "source": { "blob": blob("ok") } }]
        })),
        options,
    )
    .await
    .unwrap();

    assert!(root.join("ok.txt").exists());
    assert!(!elsewhere.exists());
}

#[tokio::test]
async fn an_install_with_no_root_or_all_of_a_disk_for_one_is_refused() {
    let no_root = refused(json!({
        "artifacts": [{ "path": "/tmp/opys-no-root.txt", "source": { "blob": blob("x") } }]
    }))
    .await;
    assert!(no_root.contains("no `root`"), "{no_root}");

    let undefined = refused(json!({ "vars": { "root": "${home}/game" }, "artifacts": [] })).await;
    assert!(undefined.contains("not defined"), "{undefined}");

    #[cfg(unix)]
    {
        let whole = refused(json!({ "vars": { "root": "/" }, "artifacts": [] })).await;
        assert!(whole.contains("whole file system"), "{whole}");
    }
}

fn launching(root: &Path, workdir: &str) -> Value {
    json!({
        "vars": { "root": text(root) },
        "artifacts": [],
        "launch": { "command": "java", "args": [], "workdir": workdir }
    })
}

#[tokio::test]
async fn a_manifest_does_not_start_the_game_outside_the_root() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("game");

    for workdir in ["${root}/..", "/", "saves"] {
        let result = prepare(source(launching(&root, workdir)), LaunchOptions::new()).await;
        match result {
            Err(InstallError::Manifest(message)) => {
                assert!(message.contains("workdir"), "{workdir}: {message}");
            }
            other => panic!("{workdir}: expected a refusal, got {other:?}"),
        }
    }

    // In the root, and the root itself.
    for workdir in ["${root}/", "${root}/instance"] {
        prepare(source(launching(&root, workdir)), LaunchOptions::new())
            .await
            .unwrap_or_else(|error| panic!("{workdir}: {error}"));
    }

    // A working directory the caller chose is the caller's.
    let mut options = LaunchOptions::new();
    options.cwd = Some(text(dir.path()));
    let spec = prepare(source(launching(&root, "${root}/..")), options)
        .await
        .unwrap();
    assert_eq!(spec.workdir, text(dir.path()));
}

/// A relative root is placed once, so what is installed and what is started
/// name the same files wherever the game's own working directory ends up.
#[tokio::test]
async fn a_relative_root_is_made_absolute_for_this_machine_only() {
    let manifest = json!({
        "vars": { "root": "game" },
        "artifacts": [],
        "launch": { "command": "${root}/bin/java", "args": ["${root}/a.jar"], "workdir": "${root}/" }
    });
    let here = std::env::current_dir().unwrap().join("game");

    let mut options = LaunchOptions::new();
    options.do_install = false;
    let spec = prepare(source(manifest.clone()), options).await.unwrap();
    // The root as this machine spells it, and the rest as the manifest did.
    assert_eq!(spec.command, format!("{}/bin/java", text(&here)));
    assert_eq!(spec.args, [format!("{}/a.jar", text(&here))]);

    // A question about a launch reads nothing, and may be about a machine
    // this is not.
    let mut asking = LaunchOptions::new();
    asking.platform = Some(OsOptions {
        name: "windows".to_owned(),
        version: String::new(),
        arch: "x86_64".to_owned(),
    });
    asking.vars = Some(VarMap::from([("root".to_owned(), "C:/game".to_owned())]));
    let spec = build_launch(source(manifest), &asking).await.unwrap();
    assert_eq!(spec.command, "C:/game/bin/java");
}
