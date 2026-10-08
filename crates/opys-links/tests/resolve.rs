//! Resolving links against stand-ins for every provider at once: what each
//! is asked, what comes back pinned, and in what order.

mod common;

use common::{Reply, TestServer};
use opys_links::{file_artifacts, resolve_links, LinkOptions, Provider};
use serde_json::{json, Value};

const SHA256_OF_HELLO: &str = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

fn asset(base: &str, name: &str, digest: Option<&str>) -> Value {
    let mut asset =
        json!({ "name": name, "size": 4242, "browser_download_url": format!("{base}/dl/{name}") });
    if let Some(digest) = digest {
        asset["digest"] = json!(format!("sha256:{digest}"));
    }
    asset
}

fn release(base: &str, tag: &str, prerelease: bool, assets: &[(&str, Option<&str>)]) -> Value {
    json!({
        "tag_name": tag, "prerelease": prerelease, "draft": false, "published_at": "2026-01-01T00:00:00Z",
        "assets": assets.iter().map(|(name, digest)| asset(base, name, *digest)).collect::<Vec<_>>(),
    })
}

/// GitHub, GitLab, Modrinth, CurseForge and a plain file host, on one port.
fn world() -> TestServer {
    TestServer::start(|request| {
        let base = format!("http://{}", request.header("host").unwrap_or_default());
        let target = request.target.as_str();

        // ── plain files ──
        if target.starts_with("/files/hello.txt") || target.starts_with("/dl/") {
            return Reply::bytes(b"hello".to_vec());
        }
        // ── GitHub ──
        if target == "/repos/o/r/releases/tags/1.0" {
            return Reply::json(
                release(
                    &base,
                    "1.0",
                    false,
                    &[("tool-1.0.jar", Some(&"a".repeat(64))), ("old.jar", None)],
                )
                .to_string(),
            );
        }
        if target.starts_with("/repos/o/r/releases?") {
            return Reply::json(
                json!([
                    release(
                        &base,
                        "3.0-rc",
                        true,
                        &[("tool.jar", Some(&"c".repeat(64)))]
                    ),
                    // The newest stable release does not ship the asset.
                    release(&base, "2.1", false, &[("notes.txt", None)]),
                    release(&base, "2.0", false, &[("tool.jar", Some(&"b".repeat(64)))]),
                ])
                .to_string(),
            );
        }
        // ── GitLab ──
        if target.starts_with("/api/v4/projects/g%2Fp/packages?") {
            return Reply::json(
                json!([{ "id": 7, "name": "pkg", "version": "0.3", "package_type": "generic", "status": "default", "created_at": "2026-01-01T00:00:00Z" }])
                    .to_string(),
            );
        }
        if target.starts_with("/api/v4/projects/g%2Fp/packages/7/package_files") {
            return Reply::json(
                json!([
                    { "file_name": "pkg-0.3.jar", "size": 100, "file_sha256": "d".repeat(64), "created_at": "2026-01-01T00:00:00Z" },
                    { "file_name": "pkg-0.3.txt", "size": 5, "file_sha256": null, "created_at": "2026-01-01T00:00:00Z" },
                ])
                .to_string(),
            );
        }
        if target == "/api/v4/projects/g%2Fp/packages/generic/pkg/0.3/pkg-0.3.txt" {
            return Reply::bytes(b"hello".to_vec());
        }
        // ── Modrinth ──
        if target.starts_with("/versions?ids=") {
            let all = [("MMM", "sodium.jar"), ("NNN", "lithium.jar")];
            let found: Vec<Value> = all
                .iter()
                .filter(|(id, _)| target.contains(id))
                .map(|(id, name)| json!({
                    "id": id, "project_id": "P", "version_number": "1",
                    "files": [{ "filename": name, "url": format!("https://cdn.modrinth.test/{name}"), "primary": true, "size": 77, "hashes": { "sha1": "e".repeat(40) } }],
                }))
                .collect();
            return Reply::json(json!(found).to_string());
        }
        // ── CurseForge ──
        if target == "/mods/files" {
            let body: Value = serde_json::from_str(&request.body).unwrap_or_default();
            let data: Vec<Value> = body["fileIds"]
                .as_array()
                .unwrap()
                .iter()
                .map(|id| json!({
                    "id": id, "modId": 1, "fileName": format!("cf-{id}.jar"), "fileLength": 88,
                    "hashes": [{ "value": "f".repeat(40), "algo": 1 }], "downloadUrl": format!("https://edge.forgecdn.test/cf-{id}.jar"),
                }))
                .collect();
            return Reply::json(json!({ "data": data }).to_string());
        }
        Reply::status(404)
    })
}

fn options(server: &TestServer) -> LinkOptions {
    LinkOptions {
        github_api: Some(server.base.clone()),
        modrinth_api: Some(server.base.clone()),
        curseforge_api: Some(server.base.clone()),
        curseforge_token: Some("cf-key".to_owned()),
        ..Default::default()
    }
}

fn links(items: &[&str]) -> Vec<String> {
    items.iter().map(|s| (*s).to_owned()).collect()
}

fn hash(file: &opys_links::ResolvedFile) -> Value {
    serde_json::to_value(&file.integrity).unwrap()
}

#[test]
fn a_github_asset_is_pinned_from_the_digest_github_publishes() {
    let server = world();
    let files = resolve_links(
        &links(&["https://github.com/o/r/releases/download/1.0/tool-1.0.jar"]),
        &options(&server),
    )
    .unwrap();

    let file = &files[0];
    assert_eq!(file.provider, Provider::GitHub);
    assert_eq!(file.filename, "tool-1.0.jar");
    assert_eq!(file.url, format!("{}/dl/tool-1.0.jar", server.base));
    assert_eq!(file.size, 4242);
    assert_eq!(hash(file), json!({ "sha256": "a".repeat(64) }));
    // By tag, and nothing downloaded: the digest was enough.
    assert_eq!(server.targets(), ["/repos/o/r/releases/tags/1.0"]);
}

#[test]
fn a_github_asset_with_no_digest_is_downloaded_and_hashed() {
    let server = world();
    let files = resolve_links(
        &links(&["https://github.com/o/r/releases/download/1.0/old.jar"]),
        &options(&server),
    )
    .unwrap();

    assert_eq!(hash(&files[0]), json!({ "sha256": SHA256_OF_HELLO }));
    // The size is the one that was read, not the one the listing claimed.
    assert_eq!(files[0].size, 5);
    assert_eq!(
        server.targets(),
        ["/repos/o/r/releases/tags/1.0", "/dl/old.jar"]
    );
}

#[test]
fn latest_means_the_newest_stable_release_that_has_the_asset() {
    let server = world();
    let files = resolve_links(
        &links(&["https://github.com/o/r/releases/latest/download/tool.jar"]),
        &options(&server),
    )
    .unwrap();

    // Not the prerelease above it, and not 2.1, which does not ship the file.
    assert_eq!(hash(&files[0]), json!({ "sha256": "b".repeat(64) }));
    // And the manifest gets a concrete address, not the moving one it was given.
    assert_eq!(files[0].url, format!("{}/dl/tool.jar", server.base));
    assert_eq!(
        files[0].link,
        "https://github.com/o/r/releases/latest/download/tool.jar"
    );
}

#[test]
fn a_missing_asset_lists_what_the_release_does_have() {
    let server = world();
    let message = resolve_links(
        &links(&["https://github.com/o/r/releases/download/1.0/nope.jar"]),
        &options(&server),
    )
    .unwrap_err()
    .to_string();

    assert_eq!(
        message,
        "Release '1.0' of o/r has no asset 'nope.jar'. It has: tool-1.0.jar, old.jar"
    );
}

#[test]
fn a_gitlab_package_file_is_pinned_from_the_registrys_hash() {
    let server = world();
    let link = format!(
        "{}/api/v4/projects/g%2Fp/packages/generic/pkg/0.3/pkg-0.3.jar",
        server.base
    );
    let files = resolve_links(std::slice::from_ref(&link), &options(&server)).unwrap();

    let file = &files[0];
    assert_eq!(file.provider, Provider::GitLab);
    assert_eq!(file.filename, "pkg-0.3.jar");
    assert_eq!(file.url, link);
    assert_eq!(file.size, 100);
    assert_eq!(hash(file), json!({ "sha256": "d".repeat(64) }));
}

#[test]
fn a_gitlab_file_the_registry_has_no_hash_for_is_hashed_here() {
    let server = world();
    let link = format!(
        "{}/api/v4/projects/g%2Fp/packages/generic/pkg/0.3/pkg-0.3.txt",
        server.base
    );
    let files = resolve_links(&[link], &options(&server)).unwrap();

    assert_eq!(hash(&files[0]), json!({ "sha256": SHA256_OF_HELLO }));
    assert_eq!(files[0].size, 5);
}

#[test]
fn a_plain_url_is_the_file_and_is_pinned_by_downloading_it() {
    let server = world();
    let link = format!("{}/files/hello.txt?download=1", server.base);
    let files = resolve_links(std::slice::from_ref(&link), &options(&server)).unwrap();

    let file = &files[0];
    assert_eq!(file.provider, Provider::Url);
    assert_eq!(file.filename, "hello.txt");
    assert_eq!(file.url, link);
    assert_eq!(file.size, 5);
    assert_eq!(hash(file), json!({ "sha256": SHA256_OF_HELLO }));
}

#[test]
fn a_plain_url_that_does_not_answer_fails_the_build() {
    let server = world();
    let link = format!("{}/files/gone.jar", server.base);
    let message = resolve_links(std::slice::from_ref(&link), &options(&server))
        .unwrap_err()
        .to_string();

    assert_eq!(message, format!("{link} returned HTTP 404"));
}

#[test]
fn modrinth_and_curseforge_links_are_batched_and_everything_keeps_its_place() {
    let server = world();
    let plain = format!("{}/files/hello.txt", server.base);
    let files = resolve_links(
        &links(&[
            "https://www.curseforge.com/minecraft/mc-mods/a/files/111",
            "https://modrinth.com/mod/lithium/version/NNN",
            &plain,
            "https://modrinth.com/mod/sodium/version/MMM",
            "https://www.curseforge.com/minecraft/mc-mods/b/files/222",
        ]),
        &options(&server),
    )
    .unwrap();

    let names: Vec<&str> = files.iter().map(|f| f.filename.as_str()).collect();
    assert_eq!(
        names,
        [
            "cf-111.jar",
            "lithium.jar",
            "hello.txt",
            "sodium.jar",
            "cf-222.jar"
        ]
    );
    assert_eq!(
        files.iter().map(|f| f.provider).collect::<Vec<_>>(),
        [
            Provider::CurseForge,
            Provider::Modrinth,
            Provider::Url,
            Provider::Modrinth,
            Provider::CurseForge
        ]
    );
    assert_eq!(hash(&files[0]), json!({ "sha1": "f".repeat(40) }));
    assert_eq!(hash(&files[1]), json!({ "sha1": "e".repeat(40) }));

    // One request per batched provider, however the links were interleaved.
    let requests = server.requests();
    assert_eq!(
        requests
            .iter()
            .filter(|r| r.target.starts_with("/versions?"))
            .count(),
        1
    );
    let curseforge: Vec<_> = requests
        .iter()
        .filter(|r| r.target == "/mods/files")
        .collect();
    assert_eq!(curseforge.len(), 1);
    assert_eq!(
        serde_json::from_str::<Value>(&curseforge[0].body).unwrap(),
        json!({ "fileIds": [111, 222] })
    );
    assert_eq!(curseforge[0].header("x-api-key"), Some("cf-key"));
}

#[test]
fn a_curseforge_link_without_a_key_says_which_link_and_asks_for_one() {
    let server = world();
    let mut keyless = options(&server);
    keyless.curseforge_token = None;
    let message = resolve_links(
        &links(&[
            "https://modrinth.com/mod/sodium/version/MMM",
            "https://www.curseforge.com/minecraft/mc-mods/a/files/111",
        ]),
        &keyless,
    )
    .unwrap_err()
    .to_string();

    assert!(
        message.starts_with(
            "https://www.curseforge.com/minecraft/mc-mods/a/files/111 is a CurseForge file"
        ),
        "{message}"
    );
    assert!(message.contains("curseforgeToken"), "{message}");
}

#[test]
fn something_that_is_no_link_fails_before_any_request() {
    let server = world();
    let result = resolve_links(
        &links(&[
            "https://github.com/o/r/releases/download/1.0/tool-1.0.jar",
            "sodium",
        ]),
        &options(&server),
    );

    assert!(result
        .unwrap_err()
        .to_string()
        .contains("\"sodium\" is not a link"));
    assert!(server.targets().is_empty());
}

#[test]
fn no_links_is_no_request() {
    let server = world();
    assert!(resolve_links(&[], &options(&server)).unwrap().is_empty());
    assert!(server.targets().is_empty());
}

#[test]
fn each_file_becomes_an_artifact_at_the_path_chosen_for_it() {
    let server = world();
    let files = resolve_links(
        &links(&[
            "https://github.com/o/r/releases/download/1.0/tool-1.0.jar",
            "https://modrinth.com/mod/sodium/version/MMM",
        ]),
        &options(&server),
    )
    .unwrap();

    let artifacts = serde_json::to_value(
        file_artifacts(
            &files,
            &[
                "${root}/tools/tool.jar".to_owned(),
                "${game_directory}/mods/sodium.jar".to_owned(),
            ],
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        artifacts,
        json!([
            {
                "path": "${root}/tools/tool.jar",
                "source": { "url": format!("{}/dl/tool-1.0.jar", server.base) },
                "size": 4242,
                "integrity": { "sha256": "a".repeat(64) },
            },
            {
                "path": "${game_directory}/mods/sodium.jar",
                "source": { "url": "https://cdn.modrinth.test/sodium.jar" },
                "size": 77,
                "integrity": { "sha1": "e".repeat(40) },
            },
        ])
    );
    let message = file_artifacts(&files, &[]).unwrap_err().to_string();
    assert_eq!(
        message,
        "2 file(s) but 0 path(s): each file needs exactly one"
    );
}

#[test]
fn resolved_files_and_options_cross_as_json() {
    let server = world();
    let files = resolve_links(
        &links(&["https://modrinth.com/mod/sodium/version/MMM"]),
        &options(&server),
    )
    .unwrap();

    let encoded = serde_json::to_value(&files).unwrap();
    assert_eq!(
        encoded,
        json!([{
            "link": "https://modrinth.com/mod/sodium/version/MMM",
            "provider": "modrinth",
            "filename": "sodium.jar",
            "url": "https://cdn.modrinth.test/sodium.jar",
            "size": 77,
            "integrity": { "sha1": "e".repeat(40) },
        }])
    );
    let decoded: Vec<opys_links::ResolvedFile> = serde_json::from_value(encoded).unwrap();
    assert_eq!(decoded, files);

    let parsed: LinkOptions = serde_json::from_value(
        json!({ "curseforgeToken": "k", "githubApi": "https://ghe.test/api/v3" }),
    )
    .unwrap();
    assert_eq!(parsed.curseforge_token.as_deref(), Some("k"));
    assert_eq!(
        parsed.github_api.as_deref(),
        Some("https://ghe.test/api/v3")
    );
}
