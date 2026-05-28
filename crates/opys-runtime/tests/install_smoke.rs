//! Smoke test for the install orchestrator with a `string` source — no
//! network, no archives. Verifies the pipeline end-to-end up through fetch
//! and integrity, plus the var-driven path interpolation.

use serde_json::json;
use std::sync::Arc;
use tempfile::tempdir;
use opys_runtime::{install, InstallOptions, InstallProgress, ManifestSource};

#[tokio::test]
async fn installs_string_source_to_interpolated_path() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();

    let manifest_json = json!({
        "vars": { "root": root },
        "artifacts": [
            { "path": "${root}/hello.txt", "source": { "string": "world" } }
        ]
    })
    .to_string();
    let manifest = opys_core::parse_manifest(&manifest_json).unwrap();

    let events = Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    let cb = {
        let events = Arc::clone(&events);
        Arc::new(move |p: InstallProgress| {
            let s = match p {
                InstallProgress::Resolve => "resolve".to_owned(),
                InstallProgress::Download { fetched, total, skipped } => {
                    format!("download {fetched}/{total} skipped={skipped}")
                }
                InstallProgress::DownloadDone { .. } => "download:done".to_owned(),
                InstallProgress::Verify => "verify".to_owned(),
                _ => "other".to_owned(),
            };
            events.lock().unwrap().push(s);
        }) as Arc<dyn Fn(InstallProgress) + Send + Sync>
    };

    let mut opts = InstallOptions::new();
    opts.on_progress = Some(cb);
    install(ManifestSource::Manifest(manifest), opts).await.unwrap();

    let written = std::fs::read_to_string(dir.path().join("hello.txt")).unwrap();
    assert_eq!(written, "world");

    let events = events.lock().unwrap();
    assert!(events.iter().any(|e| e == "resolve"));
    assert!(events.iter().any(|e| e == "verify"));
    assert!(events.iter().any(|e| e == "download:done"));
}

#[tokio::test]
async fn skips_existing_files() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    let manifest_json = json!({
        "vars": { "root": root },
        "artifacts": [
            { "path": "${root}/exists.txt", "source": { "string": "fresh" } }
        ]
    })
    .to_string();

    // Pre-populate.
    std::fs::write(dir.path().join("exists.txt"), b"prior").unwrap();

    let manifest = opys_core::parse_manifest(&manifest_json).unwrap();
    install(ManifestSource::Manifest(manifest), InstallOptions::new()).await.unwrap();

    let content = std::fs::read_to_string(dir.path().join("exists.txt")).unwrap();
    assert_eq!(content, "prior", "scan should have skipped existing file");
}
