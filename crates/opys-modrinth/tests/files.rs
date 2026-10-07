//! Mod files by version: which file each version contributes, in what order,
//! and how the ids reach the API.

mod common;

use common::{Reply, TestServer};
use opys_modrinth::{file_artifacts, parse_version_ref, resolve_modrinth_files, ModrinthFile};
use serde_json::{json, Value};

fn file(filename: &str, primary: bool) -> Value {
    json!({
        "hashes": { "sha1": "a".repeat(40), "sha512": "b".repeat(128) },
        "url": format!("https://cdn.modrinth.test/{filename}"),
        "filename": filename,
        "primary": primary,
        "size": 1234,
    })
}

fn version(id: &str, files: Vec<Value>) -> Value {
    json!({ "id": id, "project_id": format!("P{id}"), "version_number": format!("mc1.20.1-{id}"), "files": files })
}

/// The ids a `/versions?ids=…` request asked for.
fn asked(target: &str) -> Vec<String> {
    let (_, query) = target.split_once("ids=").expect("an ids query");
    let decoded = query
        .replace("%22", "\"")
        .replace("%5B", "[")
        .replace("%5D", "]")
        .replace("%2C", ",");
    serde_json::from_str(&decoded).expect("a JSON array of ids")
}

/// A Modrinth that knows `known`, answering each request with whichever of
/// them it was asked for.
fn modrinth(known: Vec<Value>) -> TestServer {
    TestServer::start(move |request| {
        let ids = asked(&request.target);
        let found: Vec<&Value> = known
            .iter()
            .filter(|v| ids.iter().any(|id| v["id"] == id.as_str()))
            .collect();
        Reply::json(json!(found).to_string())
    })
}

fn refs(ids: &[&str]) -> Vec<String> {
    ids.iter().map(|s| (*s).to_owned()).collect()
}

#[test]
fn a_version_reference_is_an_id_or_the_versions_url() {
    assert_eq!(parse_version_ref("JjCVwmVA").unwrap(), "JjCVwmVA");
    assert_eq!(
        parse_version_ref("https://modrinth.com/mod/sodium/version/JjCVwmVA").unwrap(),
        "JjCVwmVA"
    );
    assert_eq!(
        parse_version_ref("https://modrinth.com/mod/sodium/version/JjCVwmVA?x=1#files").unwrap(),
        "JjCVwmVA"
    );
    let message = parse_version_ref("https://modrinth.com/mod/sodium")
        .unwrap_err()
        .to_string();
    assert!(
        message.contains("does not contain \"/version/<id>\""),
        "{message}"
    );
}

#[test]
fn a_version_resolves_to_its_file_and_everything_known_about_it() {
    let server = modrinth(vec![version("AAA", vec![file("sodium.jar", true)])]);
    let files = resolve_modrinth_files(&refs(&["AAA"]), &server.base).unwrap();

    assert_eq!(
        files,
        [ModrinthFile {
            filename: "sodium.jar".into(),
            version_id: "AAA".into(),
            project_id: "PAAA".into(),
            version_number: "mc1.20.1-AAA".into(),
            size: 1234,
            url: "https://cdn.modrinth.test/sodium.jar".into(),
            sha1: Some("a".repeat(40)),
        }]
    );
}

#[test]
fn the_primary_file_is_taken_or_the_first_when_none_is_marked() {
    let server = modrinth(vec![
        version(
            "AAA",
            vec![file("sources.jar", false), file("mod.jar", true)],
        ),
        version(
            "BBB",
            vec![file("first.jar", false), file("second.jar", false)],
        ),
    ]);
    let files = resolve_modrinth_files(&refs(&["AAA", "BBB"]), &server.base).unwrap();

    assert_eq!(files[0].filename, "mod.jar");
    assert_eq!(files[1].filename, "first.jar");
}

#[test]
fn files_come_back_in_the_order_they_were_asked_for() {
    // The API answers in its own order; the caller's is the one that counts,
    // because each file is paired with a path by position.
    let server = modrinth(vec![
        version("AAA", vec![file("a.jar", true)]),
        version("BBB", vec![file("b.jar", true)]),
        version("CCC", vec![file("c.jar", true)]),
    ]);
    let files = resolve_modrinth_files(
        &refs(&["CCC", "https://modrinth.com/mod/x/version/AAA", "BBB"]),
        &server.base,
    )
    .unwrap();

    let names: Vec<&str> = files.iter().map(|f| f.filename.as_str()).collect();
    assert_eq!(names, ["c.jar", "a.jar", "b.jar"]);
}

#[test]
fn the_ids_travel_as_a_json_array_a_hundred_to_a_request() {
    let ids: Vec<String> = (0..250).map(|i| format!("V{i:03}")).collect();
    let server = modrinth(
        ids.iter()
            .map(|id| version(id, vec![file("f.jar", true)]))
            .collect(),
    );

    let files = resolve_modrinth_files(&ids, &server.base).unwrap();
    assert_eq!(files.len(), 250);

    let batches: Vec<Vec<String>> = server.targets().iter().map(|t| asked(t)).collect();
    assert_eq!(
        batches.iter().map(Vec::len).collect::<Vec<_>>(),
        [100, 100, 50]
    );
    assert_eq!(batches[0][0], "V000");
    assert_eq!(batches[2][49], "V249");
    assert!(server.targets()[0].starts_with("/versions?ids=%5B%22V000%22%2C%22V001%22"));
}

#[test]
fn no_references_is_no_request() {
    let server = modrinth(vec![]);
    assert!(resolve_modrinth_files(&[], &server.base)
        .unwrap()
        .is_empty());
    assert!(server.targets().is_empty());
}

#[test]
fn a_version_the_api_does_not_return_or_one_with_no_files_is_an_error() {
    let server = modrinth(vec![version("EMPTY", vec![])]);

    let message = resolve_modrinth_files(&refs(&["GONE"]), &server.base)
        .unwrap_err()
        .to_string();
    assert_eq!(
        message,
        "Modrinth API did not return metadata for version GONE"
    );

    let message = resolve_modrinth_files(&refs(&["EMPTY"]), &server.base)
        .unwrap_err()
        .to_string();
    assert_eq!(message, "Modrinth version EMPTY has no downloadable files");
}

#[test]
fn a_failing_api_call_names_its_status_and_a_bad_reference_never_reaches_it() {
    let server = TestServer::start(|_| Reply::status(503));
    let message = resolve_modrinth_files(&refs(&["AAA"]), &server.base)
        .unwrap_err()
        .to_string();
    assert!(message.contains("returned HTTP 503"), "{message}");

    let server = modrinth(vec![]);
    assert!(resolve_modrinth_files(&refs(&["https://example.test/nope"]), &server.base).is_err());
    assert!(server.targets().is_empty());
}

#[test]
fn each_file_becomes_an_artifact_at_the_path_chosen_for_it() {
    let files = vec![
        ModrinthFile {
            filename: "sodium.jar".into(),
            version_id: "AAA".into(),
            project_id: "PAAA".into(),
            version_number: "0.5.8".into(),
            size: 1234,
            url: "https://cdn.modrinth.test/sodium.jar".into(),
            sha1: Some("a".repeat(40)),
        },
        ModrinthFile {
            filename: "pack.zip".into(),
            version_id: "BBB".into(),
            project_id: "PBBB".into(),
            version_number: "1".into(),
            size: 9,
            url: "https://cdn.modrinth.test/pack.zip".into(),
            sha1: None,
        },
    ];
    let paths = vec![
        "${game_directory}/mods/sodium.jar".to_owned(),
        "${game_directory}/resourcepacks/pack.zip".to_owned(),
    ];

    let artifacts = serde_json::to_value(file_artifacts(&files, &paths).unwrap()).unwrap();
    assert_eq!(
        artifacts,
        json!([
            {
                "path": "${game_directory}/mods/sodium.jar",
                "source": { "url": "https://cdn.modrinth.test/sodium.jar" },
                "size": 1234,
                "integrity": { "sha1": "a".repeat(40) },
            },
            {
                "path": "${game_directory}/resourcepacks/pack.zip",
                "source": { "url": "https://cdn.modrinth.test/pack.zip" },
                "size": 9,
            },
        ])
    );
}

#[test]
fn a_path_for_every_file_and_no_more() {
    let message = file_artifacts(&[], &["x".to_owned()])
        .unwrap_err()
        .to_string();
    assert_eq!(
        message,
        "0 file(s) but 1 path(s): each file needs exactly one"
    );
}
