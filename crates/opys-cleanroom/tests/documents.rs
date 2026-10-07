//! Every published Cleanroom document, parsed.
//!
//! Ignored by default: it needs the documents on disk. Point it at a local
//! mirror of the site's `versions/` tree and run it directly —
//!
//! ```text
//! OPYS_CLEANROOM_DOCUMENTS=/path/to/versions \
//!   cargo test -p opys-cleanroom --test documents -- --ignored --nocapture
//! ```
//!
//! What it is for: the documents are generated once and published, so a
//! parser that reads all of them today reads every Cleanroom release there has
//! ever been. That is a stronger statement than any fixture, and it is the
//! check to re-run when either side changes — the generator's output or
//! `Client`.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use opys_mojang::Client;

fn documents(root: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.extension().is_some_and(|e| e == "json") {
                found.push(path);
            }
        }
    }
    found.sort();
    found
}

#[test]
#[ignore = "needs a local mirror of the published documents"]
fn every_published_document_parses() {
    let root = std::env::var("OPYS_CLEANROOM_DOCUMENTS")
        .expect("set OPYS_CLEANROOM_DOCUMENTS to a directory of published documents");
    let paths = documents(Path::new(&root));
    assert!(!paths.is_empty(), "no documents under {root}");

    let mut failures: Vec<String> = Vec::new();
    let mut main_classes: BTreeMap<String, usize> = BTreeMap::new();
    let mut libraries = 0usize;

    for path in &paths {
        let raw = std::fs::read_to_string(path).expect("read document");
        let parsed = serde_json::from_str::<serde_json::Value>(&raw)
            .map_err(|e| e.to_string())
            .and_then(|value| Client::from_version_json(value).map_err(|e| e.to_string()));
        match parsed {
            Ok(client) => {
                *main_classes.entry(client.main_class.clone()).or_default() += 1;
                libraries += client.libraries.len();

                // Every library must be reachable: a path to land at and a URL
                // to come from. The Cleanroom jar is the one the installer
                // leaves without an address, so this is the assertion that the
                // generator gave it one.
                for lib in client.libraries.iter() {
                    assert!(
                        !lib.artifact.path.is_empty() && !lib.artifact.url.is_empty(),
                        "{}: {} has no path or url",
                        path.display(),
                        lib.name,
                    );
                }
                // LWJGL 2, which a fold over vanilla would have left in. Its
                // group is `org.lwjgl.lwjgl`, so its artifacts sit one
                // directory below LWJGL 3's `org/lwjgl/lwjgl/<version>/`.
                assert!(
                    !client
                        .libraries
                        .iter()
                        .any(|lib| lib.artifact.path.starts_with("org/lwjgl/lwjgl/lwjgl")),
                    "{}: carries vanilla's LWJGL 2",
                    path.display(),
                );
            }
            Err(e) => failures.push(format!("{}: {e}", path.display())),
        }
    }

    println!("{} documents, {libraries} libraries", paths.len());
    for (main_class, count) in &main_classes {
        println!("  {count:>5}  {main_class}");
    }

    assert!(
        failures.is_empty(),
        "{} of {} failed to parse:\n{}",
        failures.len(),
        paths.len(),
        failures
            .iter()
            .take(20)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n"),
    );
}
