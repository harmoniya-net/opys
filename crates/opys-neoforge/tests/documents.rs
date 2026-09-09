//! Every published NeoForge document, parsed.
//!
//! Ignored by default: it needs the documents on disk. Point it at a local
//! mirror of the site's `versions/` tree and run it directly —
//!
//! ```text
//! OPYS_NEOFORGE_DOCUMENTS=/path/to/versions \
//!   cargo test -p opys-neoforge --test documents -- --ignored --nocapture
//! ```
//!
//! What it is for: the documents are generated once and published, so a
//! parser that reads all 1700-odd of them today reads every NeoForge build
//! there has ever been. That is a stronger statement than any fixture, and it
//! is the check to re-run when either side changes — the generator's output or
//! `VersionPatch`.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use opys_mojang::VersionPatch;

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
    let root = std::env::var("OPYS_NEOFORGE_DOCUMENTS")
        .expect("set OPYS_NEOFORGE_DOCUMENTS to a directory of published documents");
    let paths = documents(Path::new(&root));
    assert!(!paths.is_empty(), "no documents under {root}");

    let mut failures: Vec<String> = Vec::new();
    let mut main_classes: BTreeMap<String, usize> = BTreeMap::new();
    let mut with_override = 0usize;
    let mut with_both = 0usize;
    let mut libraries = 0usize;

    for path in &paths {
        let raw = std::fs::read_to_string(path).expect("read document");
        match serde_json::from_str::<VersionPatch>(&raw) {
            Ok(patch) => {
                *main_classes.entry(patch.main_class.clone()).or_default() += 1;
                if patch.game_override.is_some() {
                    with_override += 1;
                    if !patch.args.jvm.is_empty() {
                        with_both += 1;
                    }
                }
                libraries += patch.libraries.len();

                // Every library must be reachable: a path to land at and a URL
                // to come from. An entry missing either would install nothing
                // and fail only at launch.
                for lib in patch.libraries.iter() {
                    assert!(
                        !lib.artifact.path.is_empty() && !lib.artifact.url.is_empty(),
                        "{}: {} has no path or url",
                        path.display(),
                        lib.name,
                    );
                }
            }
            Err(e) => failures.push(format!("{}: {e}", path.display())),
        }
    }

    println!("{} documents, {libraries} libraries", paths.len());
    println!("{with_override} carry minecraftArguments, {with_both} carry both fields");
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
