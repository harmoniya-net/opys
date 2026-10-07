use std::io::Write;

use opys_modpack::{ArchiveError, LoaderSpec, PackArchive};
use serde_json::json;

fn zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    for (name, contents) in entries {
        writer
            .start_file(*name, zip::write::SimpleFileOptions::default())
            .unwrap();
        writer.write_all(contents).unwrap();
    }
    writer.finish().unwrap().into_inner()
}

#[test]
fn a_loader_spec_is_written_the_way_the_js_side_reads_it() {
    let cases = [
        (
            LoaderSpec::Fabric {
                minecraft: "1.20.1".into(),
                fabric_loader: "0.15.11".into(),
            },
            json!({ "loader": "fabric", "minecraft": "1.20.1", "fabricLoader": "0.15.11" }),
        ),
        (
            LoaderSpec::forge("1.20.1", "47.4.20"),
            json!({ "loader": "forge", "version": "1.20.1-47.4.20" }),
        ),
        (
            LoaderSpec::Neoforge {
                version: "21.1.172".into(),
            },
            json!({ "loader": "neoforge", "version": "21.1.172" }),
        ),
        (
            LoaderSpec::Vanilla {
                minecraft: "1.20.1".into(),
            },
            json!({ "loader": "vanilla", "minecraft": "1.20.1" }),
        ),
    ];
    for (spec, wire) in cases {
        assert_eq!(serde_json::to_value(&spec).unwrap(), wire);
        assert_eq!(serde_json::from_value::<LoaderSpec>(wire).unwrap(), spec);
    }
}

#[test]
fn a_spec_names_the_plugin_that_provides_it() {
    assert_eq!(LoaderSpec::forge("1.20.1", "47.4.20").plugin(), "forge");
    assert_eq!(
        LoaderSpec::Vanilla {
            minecraft: "1.20.1".into()
        }
        .plugin(),
        "minecraft"
    );
}

#[test]
fn an_entry_is_read_out_of_the_archive() {
    let bytes = zip(&[
        ("overrides/config/a.toml", b"a = 1"),
        ("manifest.json", b"{\"name\":\"Pack\"}"),
    ]);
    let archive = PackArchive::new("test pack", "https://example.test/pack.zip", bytes);

    assert_eq!(
        archive.entry("manifest.json").unwrap(),
        b"{\"name\":\"Pack\"}"
    );
}

#[test]
fn a_missing_entry_and_a_file_that_is_no_zip_are_told_apart() {
    let archive = PackArchive::new(
        "test pack",
        "https://example.test/pack.zip",
        zip(&[("a", b"")]),
    );
    let missing = archive.entry("manifest.json").unwrap_err();
    assert!(matches!(missing, ArchiveError::MissingEntry { .. }));
    assert_eq!(missing.to_string(), "test pack is missing manifest.json");

    let garbage = PackArchive::new(
        "test pack",
        "https://example.test/pack.zip",
        b"<html>".to_vec(),
    );
    let unreadable = garbage.entry("manifest.json").unwrap_err();
    assert!(matches!(unreadable, ArchiveError::Unreadable { .. }));
    assert!(unreadable
        .to_string()
        .starts_with("test pack is not a readable zip archive"));
}

#[test]
fn the_overrides_artifact_is_the_archive_itself_with_each_directory_unpacked() {
    let bytes = zip(&[("overrides/options.txt", b"fov:90")]);
    let archive = PackArchive::new("test pack", "https://example.test/pack.zip", bytes.clone());

    let artifact = archive.overrides("${root}/cache/pack.zip", &["overrides", "client-overrides"]);
    let encoded = serde_json::to_value(&artifact).unwrap();

    assert_eq!(encoded["path"], "${root}/cache/pack.zip");
    assert_eq!(
        encoded["source"],
        json!({ "url": "https://example.test/pack.zip" })
    );
    assert_eq!(encoded["size"], bytes.len());
    // Hash of the bytes that were read, so the install-time download is held
    // to being the same file.
    let sha1 = encoded["integrity"]["sha1"].as_str().unwrap();
    assert_eq!(sha1.len(), 40);
    assert_ne!(
        sha1,
        serde_json::to_value(
            PackArchive::new("p", "u", zip(&[("overrides/options.txt", b"fov:70")]))
                .overrides("x", &[])
        )
        .unwrap()["integrity"]["sha1"]
    );
    assert_eq!(
        encoded["extract"],
        json!([
            { "matches": "overrides/", "into": "${game_directory}", "strip": ["overrides/"] },
            { "matches": "client-overrides/", "into": "${game_directory}", "strip": ["client-overrides/"] },
        ])
    );
}
