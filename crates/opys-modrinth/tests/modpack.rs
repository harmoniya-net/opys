//! `.mrpack` modpacks: the reference, the download, the index, and what comes
//! out — client files, the overrides artifact, the loader.

mod common;

use std::collections::BTreeMap;
use std::io::Write;

use common::{Reply, TestServer};
use opys_modrinth::{
    loader_spec, parse_modpack_ref, resolve_modrinth_modpack, LoaderSpec, ModpackRef,
};
use serde_json::{json, Value};

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

fn dependencies(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
    pairs
        .iter()
        .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
        .collect()
}

fn index() -> Value {
    json!({
        "formatVersion": 1,
        "game": "minecraft",
        "versionId": "1.0.0",
        "name": "Test Pack",
        "dependencies": { "minecraft": "1.20.1", "fabric-loader": "0.15.11" },
        "files": [
            {
                "path": "mods/sodium.jar",
                "hashes": { "sha1": "a".repeat(40), "sha512": "b".repeat(128) },
                "env": { "client": "required", "server": "unsupported" },
                "downloads": ["https://cdn.modrinth.test/sodium.jar", "https://mirror.test/sodium.jar"],
                "fileSize": 1000,
            },
            {
                "path": "mods/server-only.jar",
                "hashes": { "sha1": "c".repeat(40) },
                "env": { "client": "unsupported", "server": "required" },
                "downloads": ["https://cdn.modrinth.test/server-only.jar"],
                "fileSize": 2000,
            },
            {
                "path": "resourcepacks/optional.zip",
                "hashes": {},
                "env": { "client": "optional", "server": "unsupported" },
                "downloads": ["https://cdn.modrinth.test/optional.zip"],
                "fileSize": 3000,
            },
            {
                "path": "config/no-env.toml",
                "hashes": { "sha1": "d".repeat(40) },
                "downloads": ["https://cdn.modrinth.test/no-env.toml"],
                "fileSize": 40,
            },
        ],
    })
}

fn mrpack(index: &Value) -> Vec<u8> {
    zip(&[
        ("modrinth.index.json", index.to_string().as_bytes()),
        ("overrides/options.txt", b"fov:90"),
    ])
}

/// A Modrinth whose version `PACK` has one pack file, served from itself.
fn modrinth(pack: Vec<u8>) -> TestServer {
    TestServer::start(move |request| {
        let base = format!("http://{}", request.header("host").unwrap_or_default());
        match request.target.as_str() {
            "/version/PACK" => Reply::json(
                json!({ "files": [
                    { "url": format!("{base}/data/extra.zip"), "filename": "extra.zip", "primary": true },
                    { "url": format!("{base}/data/old.mrpack"), "filename": "old.mrpack", "primary": false },
                    { "url": format!("{base}/data/pack.mrpack"), "filename": "pack.mrpack", "primary": true },
                ]})
                .to_string(),
            ),
            "/version/NOTAPACK" => Reply::json(
                json!({ "files": [{ "url": format!("{base}/data/mod.jar"), "filename": "mod.jar", "primary": true }] })
                    .to_string(),
            ),
            "/data/pack.mrpack" => Reply::bytes(pack.clone()),
            _ => Reply::status(404),
        }
    })
}

#[test]
fn dependencies_map_to_the_loader_the_pack_runs_on() {
    assert_eq!(
        loader_spec(&dependencies(&[
            ("minecraft", "1.20.1"),
            ("fabric-loader", "0.15.11")
        ]))
        .unwrap(),
        LoaderSpec::Fabric {
            minecraft: "1.20.1".into(),
            fabric_loader: "0.15.11".into()
        }
    );
    // Forge's build id is the two versions fused.
    assert_eq!(
        loader_spec(&dependencies(&[
            ("minecraft", "1.20.1"),
            ("forge", "47.4.20")
        ]))
        .unwrap(),
        LoaderSpec::Forge {
            version: "1.20.1-47.4.20".into()
        }
    );
    // NeoForge's is passed through; the index is what knows its Minecraft.
    assert_eq!(
        loader_spec(&dependencies(&[
            ("minecraft", "1.21.1"),
            ("neoforge", "21.1.172")
        ]))
        .unwrap(),
        LoaderSpec::Neoforge {
            version: "21.1.172".into()
        }
    );
    assert_eq!(
        loader_spec(&dependencies(&[("minecraft", "1.20.1")])).unwrap(),
        LoaderSpec::Vanilla {
            minecraft: "1.20.1".into()
        }
    );
}

#[test]
fn quilt_and_a_pack_with_no_minecraft_are_refused() {
    let quilt = loader_spec(&dependencies(&[
        ("minecraft", "1.20.1"),
        ("quilt-loader", "0.26.0"),
    ]));
    assert!(quilt.unwrap_err().to_string().contains("Quilt"));

    let headless = loader_spec(&dependencies(&[("fabric-loader", "0.15.11")]));
    assert!(headless
        .unwrap_err()
        .to_string()
        .contains("missing its \"minecraft\""));
}

#[test]
fn a_modpack_reference_is_an_id_a_version_url_or_the_pack_itself() {
    assert_eq!(
        parse_modpack_ref("xVcA1pSL").unwrap(),
        ModpackRef::Version("xVcA1pSL")
    );
    assert_eq!(
        parse_modpack_ref("https://modrinth.com/modpack/fabulously-optimized/version/xVcA1pSL")
            .unwrap(),
        ModpackRef::Version("xVcA1pSL")
    );
    assert_eq!(
        parse_modpack_ref("https://example.test/my.mrpack").unwrap(),
        ModpackRef::Url("https://example.test/my.mrpack")
    );
    assert_eq!(
        parse_modpack_ref("https://cdn.modrinth.com/data/x/versions/y/pack").unwrap(),
        ModpackRef::Url("https://cdn.modrinth.com/data/x/versions/y/pack")
    );
    let message = parse_modpack_ref("https://example.test/pack.zip")
        .unwrap_err()
        .to_string();
    assert!(
        message.contains("neither a .mrpack file nor a /version/<id> link"),
        "{message}"
    );
}

#[test]
fn a_version_resolves_through_its_primary_pack_file() {
    let server = modrinth(mrpack(&index()));
    let pack = resolve_modrinth_modpack("PACK", &server.base).unwrap();

    // Not the primary file that is no pack, and not the pack that is not
    // primary.
    assert_eq!(server.targets(), ["/version/PACK", "/data/pack.mrpack"]);
    assert_eq!(pack.index.name, "Test Pack");
    assert_eq!(
        pack.loader,
        LoaderSpec::Fabric {
            minecraft: "1.20.1".into(),
            fabric_loader: "0.15.11".into()
        }
    );
    assert_eq!(pack.dependencies, pack.index.dependencies);
}

#[test]
fn every_file_the_client_can_use_becomes_an_artifact_from_its_first_mirror() {
    let server = modrinth(mrpack(&index()));
    let pack = resolve_modrinth_modpack("PACK", &server.base).unwrap();

    assert_eq!(
        serde_json::to_value(&pack.files).unwrap(),
        json!([
            {
                "path": "${game_directory}/mods/sodium.jar",
                "source": { "url": "https://cdn.modrinth.test/sodium.jar" },
                "size": 1000,
                "integrity": { "sha1": "a".repeat(40) },
            },
            // Optional on the client is still installed; only `unsupported`
            // is left out. No sha1, so no integrity.
            {
                "path": "${game_directory}/resourcepacks/optional.zip",
                "source": { "url": "https://cdn.modrinth.test/optional.zip" },
                "size": 3000,
            },
            // No `env` at all means every side.
            {
                "path": "${game_directory}/config/no-env.toml",
                "source": { "url": "https://cdn.modrinth.test/no-env.toml" },
                "size": 40,
                "integrity": { "sha1": "d".repeat(40) },
            },
        ])
    );
}

#[test]
fn the_overrides_artifact_is_the_pack_itself_unpacked_twice() {
    let bytes = mrpack(&index());
    let server = modrinth(bytes.clone());
    let pack = resolve_modrinth_modpack("PACK", &server.base).unwrap();

    let overrides = serde_json::to_value(&pack.overrides).unwrap();
    assert_eq!(overrides["path"], "${root}/cache/modrinth-modpack.mrpack");
    assert_eq!(
        overrides["source"],
        json!({ "url": format!("{}/data/pack.mrpack", server.base) })
    );
    assert_eq!(overrides["size"], bytes.len());
    assert_eq!(overrides["integrity"]["sha1"].as_str().unwrap().len(), 40);
    assert_eq!(
        overrides["extract"],
        json!([
            { "matches": "overrides/", "into": "${game_directory}", "strip": ["overrides/"] },
            { "matches": "client-overrides/", "into": "${game_directory}", "strip": ["client-overrides/"] },
        ])
    );
}

#[test]
fn a_direct_pack_url_is_downloaded_without_asking_the_api() {
    let server = modrinth(mrpack(&index()));
    let url = format!("{}/data/pack.mrpack", server.base);
    let pack = resolve_modrinth_modpack(&url, "http://127.0.0.1:1/unused").unwrap();

    assert_eq!(server.targets(), ["/data/pack.mrpack"]);
    assert_eq!(pack.files.len(), 3);
}

#[test]
fn a_version_with_no_pack_file_is_not_a_modpack() {
    let server = modrinth(vec![]);
    let message = resolve_modrinth_modpack("NOTAPACK", &server.base)
        .unwrap_err()
        .to_string();
    assert_eq!(
        message,
        "Modrinth version NOTAPACK has no .mrpack file — is it a modpack?"
    );
}

#[test]
fn each_way_the_download_can_go_wrong_says_which() {
    let server = modrinth(vec![]);

    let missing = format!("{}/data/gone.mrpack", server.base);
    let message = resolve_modrinth_modpack(&missing, &server.base)
        .unwrap_err()
        .to_string();
    assert_eq!(
        message,
        format!("Failed to download .mrpack: HTTP 404 ({missing})")
    );

    let server = modrinth(b"<html>not a zip</html>".to_vec());
    let message = resolve_modrinth_modpack("PACK", &server.base)
        .unwrap_err()
        .to_string();
    assert!(
        message.starts_with(".mrpack archive is not a readable zip archive"),
        "{message}"
    );

    let server = modrinth(zip(&[("overrides/options.txt", b"fov:90")]));
    let message = resolve_modrinth_modpack("PACK", &server.base)
        .unwrap_err()
        .to_string();
    assert_eq!(message, ".mrpack archive is missing modrinth.index.json");

    let server = modrinth(zip(&[("modrinth.index.json", b"[]")]));
    let message = resolve_modrinth_modpack("PACK", &server.base)
        .unwrap_err()
        .to_string();
    assert!(
        message.starts_with("modrinth.index.json is not a modpack index"),
        "{message}"
    );
}

#[test]
fn a_file_with_nowhere_to_come_from_is_named() {
    let mut broken = index();
    broken["files"][0]["downloads"] = json!([]);
    let server = modrinth(mrpack(&broken));
    let message = resolve_modrinth_modpack("PACK", &server.base)
        .unwrap_err()
        .to_string();

    assert_eq!(
        message,
        "Modrinth modpack file \"mods/sodium.jar\" has no download URL."
    );
}

#[test]
fn a_resolved_pack_roundtrips_through_json() {
    let server = modrinth(mrpack(&index()));
    let pack = resolve_modrinth_modpack("PACK", &server.base).unwrap();

    let encoded = serde_json::to_value(&pack).unwrap();
    assert_eq!(
        encoded["loader"],
        json!({ "loader": "fabric", "minecraft": "1.20.1", "fabricLoader": "0.15.11" })
    );
    assert_eq!(
        encoded["index"]["files"][0]["env"],
        json!({ "client": "required", "server": "unsupported" })
    );
    let decoded: opys_modrinth::ResolvedModpack = serde_json::from_value(encoded).unwrap();
    assert_eq!(decoded, pack);
}
