//! Modpack archives: the three rounds with the API, the download between
//! them, and what comes out — mods, the overrides artifact, the loader.

mod common;

use std::io::Write;

use common::{Reply, TestServer};
use opys_curseforge::{
    loader_spec, resolve_curseforge_modpack, FileRef, LoaderSpec, ModpackManifest,
};
use serde_json::{json, Value};

const PACK_ID: u64 = 1040985;

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

fn manifest() -> Value {
    json!({
        "minecraft": {
            "version": "1.20.1",
            "modLoaders": [{ "id": "forge-47.4.20", "primary": true }],
        },
        "manifestType": "minecraftModpack",
        "manifestVersion": 1,
        "name": "Test Pack",
        "version": "1.2.3",
        "author": "someone",
        "files": [
            { "projectID": 238222, "fileID": 100, "required": true },
            { "projectID": 225643, "fileID": 200, "required": true },
        ],
        "overrides": "overrides",
    })
}

fn with_loaders(loaders: Value) -> ModpackManifest {
    let mut raw = manifest();
    raw["minecraft"]["modLoaders"] = loaders;
    serde_json::from_value(raw).unwrap()
}

fn pack_zip(manifest: &Value) -> Vec<u8> {
    zip(&[
        ("manifest.json", manifest.to_string().as_bytes()),
        ("overrides/config/a.toml", b"a = 1"),
    ])
}

fn file(id: u64, name: &str, url: Option<String>) -> Value {
    json!({
        "id": id, "modId": id + 1_000_000, "fileName": name, "fileLength": 4096,
        "hashes": [{ "value": "a".repeat(40), "algo": 1 }],
        "downloadUrl": url,
    })
}

/// A CurseForge holding the pack and the mods in `mods`, serving the archive
/// from itself.
fn curseforge(archive: Vec<u8>, mods: Vec<Value>) -> TestServer {
    TestServer::start(move |request| {
        let base = format!("http://{}", request.header("host").unwrap_or_default());
        if request.target == "/cdn/pack.zip" {
            return Reply::bytes(archive.clone());
        }
        let body: Value = serde_json::from_str(&request.body).unwrap_or_default();
        let ids: Vec<u64> = body["fileIds"]
            .as_array()
            .map(|a| a.iter().filter_map(Value::as_u64).collect())
            .unwrap_or_default();
        let pack = file(PACK_ID, "pack.zip", Some(format!("{base}/cdn/pack.zip")));
        let data: Vec<&Value> = std::iter::once(&pack)
            .chain(mods.iter())
            .filter(|f| ids.contains(&f["id"].as_u64().unwrap()))
            .collect();
        Reply::json(json!({ "data": data }).to_string())
    })
}

fn both_mods() -> Vec<Value> {
    vec![
        // The API's order is not the manifest's.
        file(
            200,
            "botania.jar",
            Some("https://edge.forgecdn.test/botania.jar".into()),
        ),
        file(
            100,
            "jei.jar",
            Some("https://edge.forgecdn.test/jei.jar".into()),
        ),
    ]
}

#[test]
fn the_primary_loader_decides_or_the_first_when_none_is_marked() {
    assert_eq!(
        loader_spec(&with_loaders(
            json!([{ "id": "forge-47.4.20", "primary": true }])
        ))
        .unwrap(),
        LoaderSpec::Forge {
            version: "1.20.1-47.4.20".into()
        }
    );
    assert_eq!(
        loader_spec(&with_loaders(
            json!([{ "id": "fabric-0.15.11", "primary": true }])
        ))
        .unwrap(),
        LoaderSpec::Fabric {
            minecraft: "1.20.1".into(),
            fabric_loader: "0.15.11".into()
        }
    );
    assert_eq!(
        loader_spec(&with_loaders(
            json!([{ "id": "neoforge-21.1.172", "primary": true }])
        ))
        .unwrap(),
        LoaderSpec::Neoforge {
            version: "21.1.172".into()
        }
    );
    assert_eq!(
        loader_spec(&with_loaders(json!([
            { "id": "fabric-0.15.11", "primary": false },
            { "id": "forge-47.4.20", "primary": true },
        ])))
        .unwrap(),
        LoaderSpec::Forge {
            version: "1.20.1-47.4.20".into()
        }
    );
    assert_eq!(
        loader_spec(&with_loaders(
            json!([{ "id": "fabric-0.15.11" }, { "id": "forge-47.4.20" }])
        ))
        .unwrap(),
        LoaderSpec::Fabric {
            minecraft: "1.20.1".into(),
            fabric_loader: "0.15.11".into()
        }
    );
}

#[test]
fn a_loader_version_keeps_its_own_hyphens() {
    // Only the first hyphen separates the loader from its version.
    assert_eq!(
        loader_spec(&with_loaders(
            json!([{ "id": "neoforge-20.4.80-beta", "primary": true }])
        ))
        .unwrap(),
        LoaderSpec::Neoforge {
            version: "20.4.80-beta".into()
        }
    );
}

#[test]
fn quilt_an_unknown_loader_and_no_loader_are_each_refused() {
    let quilt = loader_spec(&with_loaders(
        json!([{ "id": "quilt-0.26.0", "primary": true }]),
    ));
    assert!(quilt.unwrap_err().to_string().contains("Quilt"));

    let unknown = loader_spec(&with_loaders(
        json!([{ "id": "risugami-1.0", "primary": true }]),
    ));
    assert_eq!(
        unknown.unwrap_err().to_string(),
        "Unknown CurseForge mod loader \"risugami-1.0\"."
    );

    let none = loader_spec(&with_loaders(json!([])));
    assert_eq!(
        none.unwrap_err().to_string(),
        "CurseForge modpack manifest has no mod loader."
    );
}

#[test]
fn a_pack_resolves_in_three_rounds_with_one_download_between() {
    let server = curseforge(pack_zip(&manifest()), both_mods());
    let pack = resolve_curseforge_modpack("key", &FileRef::Id(PACK_ID), &server.base).unwrap();

    let requests = server.requests();
    assert_eq!(
        requests
            .iter()
            .map(|r| r.target.as_str())
            .collect::<Vec<_>>(),
        ["/mods/files", "/cdn/pack.zip", "/mods/files"]
    );
    assert_eq!(
        serde_json::from_str::<Value>(&requests[0].body).unwrap(),
        json!({ "fileIds": [PACK_ID] })
    );
    assert_eq!(
        serde_json::from_str::<Value>(&requests[2].body).unwrap(),
        json!({ "fileIds": [100, 200] })
    );
    // The key goes to the API and not to the CDN.
    assert_eq!(requests[0].header("x-api-key"), Some("key"));
    assert_eq!(requests[1].header("x-api-key"), None);

    assert_eq!(pack.manifest.name, "Test Pack");
    assert_eq!(
        pack.loader,
        LoaderSpec::Forge {
            version: "1.20.1-47.4.20".into()
        }
    );
}

#[test]
fn every_mod_lands_under_mods_in_the_manifests_order() {
    let server = curseforge(pack_zip(&manifest()), both_mods());
    let pack = resolve_curseforge_modpack("key", &FileRef::Id(PACK_ID), &server.base).unwrap();

    assert_eq!(
        serde_json::to_value(&pack.files).unwrap(),
        json!([
            {
                "path": "${game_directory}/mods/jei.jar",
                "source": { "url": "https://edge.forgecdn.test/jei.jar" },
                "size": 4096,
                "integrity": { "sha1": "a".repeat(40) },
            },
            {
                "path": "${game_directory}/mods/botania.jar",
                "source": { "url": "https://edge.forgecdn.test/botania.jar" },
                "size": 4096,
                "integrity": { "sha1": "a".repeat(40) },
            },
        ])
    );
}

#[test]
fn a_mod_with_no_download_url_is_addressed_on_the_cdn() {
    let mods = vec![file(100, "jei.jar", None), both_mods().remove(0)];
    let server = curseforge(pack_zip(&manifest()), mods);
    let pack = resolve_curseforge_modpack("key", &FileRef::Id(PACK_ID), &server.base).unwrap();

    assert_eq!(
        serde_json::to_value(&pack.files[0]).unwrap()["source"]["url"],
        "https://edge.forgecdn.net/files/0/100/jei.jar"
    );
}

#[test]
fn the_overrides_artifact_unpacks_the_directory_the_manifest_names() {
    let bytes = pack_zip(&manifest());
    let server = curseforge(bytes.clone(), both_mods());
    let pack = resolve_curseforge_modpack("key", &FileRef::Id(PACK_ID), &server.base).unwrap();

    let overrides = serde_json::to_value(&pack.overrides).unwrap();
    assert_eq!(overrides["path"], "${root}/cache/curseforge-modpack.zip");
    assert_eq!(
        overrides["source"],
        json!({ "url": format!("{}/cdn/pack.zip", server.base) })
    );
    assert_eq!(overrides["size"], bytes.len());
    assert_eq!(overrides["integrity"]["sha1"].as_str().unwrap().len(), 40);
    // One rule, which the manifest format writes bare rather than as a list
    // of one.
    assert_eq!(
        overrides["extract"],
        json!({ "matches": "overrides/", "into": "${game_directory}", "strip": ["overrides/"] })
    );

    // A pack may call the directory something else, or not say.
    for (named, expected) in [
        (json!("custom-files"), "custom-files/"),
        (json!(""), "overrides/"),
        (Value::Null, "overrides/"),
    ] {
        let mut renamed = manifest();
        if named.is_null() {
            renamed.as_object_mut().unwrap().remove("overrides");
        } else {
            renamed["overrides"] = named;
        }
        let server = curseforge(pack_zip(&renamed), both_mods());
        let pack = resolve_curseforge_modpack("key", &FileRef::Id(PACK_ID), &server.base).unwrap();
        assert_eq!(
            serde_json::to_value(&pack.overrides).unwrap()["extract"]["matches"],
            expected
        );
    }
}

#[test]
fn the_pack_may_be_named_by_its_url() {
    let server = curseforge(pack_zip(&manifest()), both_mods());
    let reference = FileRef::Url(format!(
        "https://www.curseforge.com/minecraft/modpacks/x/files/{PACK_ID}"
    ));
    let pack = resolve_curseforge_modpack("key", &reference, &server.base).unwrap();

    assert_eq!(pack.files.len(), 2);
}

#[test]
fn each_thing_that_can_be_missing_is_named() {
    let server = curseforge(pack_zip(&manifest()), both_mods());
    let message = resolve_curseforge_modpack("key", &FileRef::Id(5), &server.base)
        .unwrap_err()
        .to_string();
    assert_eq!(message, "CurseForge API did not return the modpack file 5");

    let server = curseforge(pack_zip(&manifest()), vec![both_mods().remove(1)]);
    let message = resolve_curseforge_modpack("key", &FileRef::Id(PACK_ID), &server.base)
        .unwrap_err()
        .to_string();
    assert_eq!(
        message,
        "CurseForge API did not return metadata for modpack file 200 (project 225643)"
    );

    let server = curseforge(zip(&[("overrides/a", b"")]), both_mods());
    let message = resolve_curseforge_modpack("key", &FileRef::Id(PACK_ID), &server.base)
        .unwrap_err()
        .to_string();
    assert_eq!(message, "CurseForge modpack .zip is missing manifest.json");

    let server = curseforge(b"<html>".to_vec(), both_mods());
    let message = resolve_curseforge_modpack("key", &FileRef::Id(PACK_ID), &server.base)
        .unwrap_err()
        .to_string();
    assert!(
        message.starts_with("CurseForge modpack .zip is not a readable zip archive"),
        "{message}"
    );

    let server = curseforge(zip(&[("manifest.json", b"[]")]), both_mods());
    let message = resolve_curseforge_modpack("key", &FileRef::Id(PACK_ID), &server.base)
        .unwrap_err()
        .to_string();
    assert!(
        message.starts_with("manifest.json is not a modpack manifest"),
        "{message}"
    );
}

#[test]
fn a_resolved_pack_roundtrips_through_json() {
    let server = curseforge(pack_zip(&manifest()), both_mods());
    let pack = resolve_curseforge_modpack("key", &FileRef::Id(PACK_ID), &server.base).unwrap();

    let encoded = serde_json::to_value(&pack).unwrap();
    assert_eq!(
        encoded["loader"],
        json!({ "loader": "forge", "version": "1.20.1-47.4.20" })
    );
    assert_eq!(
        encoded["manifest"]["files"][0],
        json!({ "projectID": 238222, "fileID": 100, "required": true })
    );
    assert_eq!(
        encoded["manifest"]["minecraft"]["modLoaders"][0]["id"],
        "forge-47.4.20"
    );
    let decoded: opys_curseforge::ResolvedModpack = serde_json::from_value(encoded).unwrap();
    assert_eq!(decoded, pack);
}
