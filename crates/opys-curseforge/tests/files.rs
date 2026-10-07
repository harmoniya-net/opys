//! Mod files by id: the reference, the batched lookup, the order, and the
//! CDN address a file gets when the API gives it none.

mod common;

use common::{Reply, TestServer};
use opys_curseforge::{
    fetch_curseforge_files, file_artifacts, resolve_curseforge_files, CurseForgeFile, FileRef,
};
use serde_json::{json, Value};

fn file(id: u64, name: &str) -> Value {
    json!({
        "id": id, "modId": id + 1_000_000, "fileName": name, "fileLength": 4096,
        "hashes": [{ "value": "md5md5", "algo": 2 }, { "value": "a".repeat(40), "algo": 1 }],
        "downloadUrl": format!("https://edge.forgecdn.test/{name}"),
    })
}

/// A CurseForge that knows `known`, answering each POST with whichever of
/// them it was asked for — in its own order, not the request's.
fn curseforge(known: Vec<Value>) -> TestServer {
    TestServer::start(move |request| {
        let body: Value = serde_json::from_str(&request.body).unwrap_or_default();
        let ids: Vec<u64> = body["fileIds"]
            .as_array()
            .map(|a| a.iter().filter_map(Value::as_u64).collect())
            .unwrap_or_default();
        let data: Vec<&Value> = known
            .iter()
            .filter(|f| ids.contains(&f["id"].as_u64().unwrap()))
            .collect();
        Reply::json(json!({ "data": data }).to_string())
    })
}

#[test]
fn a_file_reference_is_an_id_or_the_files_url() {
    assert_eq!(FileRef::Id(6307712).id().unwrap(), 6307712);
    assert_eq!(
        FileRef::Url("https://www.curseforge.com/minecraft/mc-mods/botania/files/2283837".into())
            .id()
            .unwrap(),
        2283837
    );
    assert_eq!(
        FileRef::Url("https://www.curseforge.com/minecraft/mc-mods/x/files/42/download".into())
            .id()
            .unwrap(),
        42
    );
    for bad in [
        "https://www.curseforge.com/minecraft/mc-mods/botania",
        "2283837",
        "/files/abc",
    ] {
        let message = FileRef::Url(bad.into()).id().unwrap_err().to_string();
        assert!(
            message.contains("does not contain \"/files/<id>\""),
            "{message}"
        );
    }
    // A config writes either a number or a string, and each is read as itself.
    let refs: Vec<FileRef> = serde_json::from_value(json!([7, "https://x/files/8"])).unwrap();
    assert_eq!(
        refs,
        [FileRef::Id(7), FileRef::Url("https://x/files/8".into())]
    );
}

#[test]
fn a_file_resolves_to_everything_known_about_it() {
    let server = curseforge(vec![file(100, "jei.jar")]);
    let files = resolve_curseforge_files("key", &[FileRef::Id(100)], &server.base).unwrap();

    assert_eq!(
        files,
        [CurseForgeFile {
            file_id: 100,
            project_id: 1_000_100,
            filename: "jei.jar".into(),
            size: 4096,
            url: "https://edge.forgecdn.test/jei.jar".into(),
            // algo 1 is sha1; the md5 beside it is not offered as one.
            sha1: Some("a".repeat(40)),
        }]
    );
}

#[test]
fn a_file_with_no_download_url_is_addressed_on_the_cdn() {
    let mut withheld = file(6307712, "Some Mod [Forge] 1.0.jar");
    withheld["downloadUrl"] = Value::Null;
    let server = curseforge(vec![withheld]);
    let files = resolve_curseforge_files("key", &[FileRef::Id(6307712)], &server.base).unwrap();

    // The id split at the thousands, and the name escaped as one segment.
    assert_eq!(
        files[0].url,
        "https://edge.forgecdn.net/files/6307/712/Some%20Mod%20%5BForge%5D%201.0.jar"
    );
}

#[test]
fn a_file_with_no_sha1_has_none() {
    let mut md5_only = file(100, "a.jar");
    md5_only["hashes"] = json!([{ "value": "md5md5", "algo": 2 }]);
    let server = curseforge(vec![md5_only]);
    let files = resolve_curseforge_files("key", &[FileRef::Id(100)], &server.base).unwrap();

    assert_eq!(files[0].sha1, None);
    let artifacts = file_artifacts(&files, &["mods/a.jar".to_owned()]).unwrap();
    assert!(artifacts[0].integrity.is_none());
}

#[test]
fn files_come_back_in_the_order_asked_for_whatever_the_api_answers() {
    let server = curseforge(vec![file(1, "a.jar"), file(2, "b.jar"), file(3, "c.jar")]);
    let files = resolve_curseforge_files(
        "key",
        &[
            FileRef::Id(3),
            FileRef::Url("https://x/files/1".into()),
            FileRef::Id(2),
            FileRef::Id(3),
        ],
        &server.base,
    )
    .unwrap();

    let names: Vec<&str> = files.iter().map(|f| f.filename.as_str()).collect();
    // The same file twice is two files: it may be going to two places.
    assert_eq!(names, ["c.jar", "a.jar", "b.jar", "c.jar"]);
}

#[test]
fn the_ids_are_posted_two_hundred_at_a_time_with_the_key() {
    let ids: Vec<u64> = (1..=450).collect();
    let server = curseforge(ids.iter().map(|id| file(*id, "f.jar")).collect());

    let files = fetch_curseforge_files("secret-key", &ids, &server.base).unwrap();
    assert_eq!(files.len(), 450);

    let requests = server.requests();
    assert_eq!(requests.len(), 3);
    let sizes: Vec<usize> = requests
        .iter()
        .map(|r| {
            serde_json::from_str::<Value>(&r.body).unwrap()["fileIds"]
                .as_array()
                .unwrap()
                .len()
        })
        .collect();
    assert_eq!(sizes, [200, 200, 50]);
    for request in &requests {
        assert_eq!(request.target, "/mods/files");
        assert_eq!(request.header("x-api-key"), Some("secret-key"));
        assert_eq!(request.header("content-type"), Some("application/json"));
    }
}

#[test]
fn no_references_is_no_request() {
    let server = curseforge(vec![]);
    assert!(resolve_curseforge_files("key", &[], &server.base)
        .unwrap()
        .is_empty());
    assert!(server.requests().is_empty());
}

#[test]
fn a_file_the_api_does_not_return_is_named() {
    let server = curseforge(vec![file(1, "a.jar")]);
    let message =
        resolve_curseforge_files("key", &[FileRef::Id(1), FileRef::Id(999)], &server.base)
            .unwrap_err()
            .to_string();

    assert_eq!(
        message,
        "CurseForge API did not return metadata for file 999"
    );
}

#[test]
fn a_refused_request_names_its_status_and_never_the_key() {
    let server = TestServer::start(|_| Reply::status(403));
    let message = resolve_curseforge_files("secret-key", &[FileRef::Id(1)], &server.base)
        .unwrap_err()
        .to_string();

    assert_eq!(message, "CurseForge API 403 (POST /mods/files)");
    assert!(!message.contains("secret-key"));
}

#[test]
fn each_file_becomes_an_artifact_at_the_path_chosen_for_it() {
    let files = vec![CurseForgeFile {
        file_id: 100,
        project_id: 200,
        filename: "jei.jar".into(),
        size: 4096,
        url: "https://edge.forgecdn.test/jei.jar".into(),
        sha1: Some("a".repeat(40)),
    }];

    let artifacts = serde_json::to_value(
        file_artifacts(&files, &["${game_directory}/mods/jei.jar".to_owned()]).unwrap(),
    )
    .unwrap();
    assert_eq!(
        artifacts,
        json!([{
            "path": "${game_directory}/mods/jei.jar",
            "source": { "url": "https://edge.forgecdn.test/jei.jar" },
            "size": 4096,
            "integrity": { "sha1": "a".repeat(40) },
        }])
    );
    let message = file_artifacts(&files, &[]).unwrap_err().to_string();
    assert_eq!(
        message,
        "1 file(s) but 0 path(s): each file needs exactly one"
    );
}
