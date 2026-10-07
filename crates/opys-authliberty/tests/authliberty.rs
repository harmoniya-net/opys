//! Resolving AuthLiberty against a stand-in GitLab: which package, which file,
//! which URL — and then the artifact and the JVM arguments made from them.

mod common;

use common::{Reply, TestServer};
use opys_authliberty::{
    build_authliberty, resolve_authliberty, resolve_authliberty_version, AuthLibertyHosts,
    AuthLibertyOptions, ResolveAuthLibertyOptions,
};
use serde_json::{json, Value};

fn package(id: u64, version: &str, created_at: &str) -> Value {
    json!({
        "id": id, "name": "authliberty", "version": version,
        "package_type": "generic", "status": "default", "created_at": created_at,
    })
}

fn file(name: &str, created_at: &str) -> Value {
    json!({
        "id": 1, "package_id": 100, "file_name": name, "size": 4096,
        "file_sha256": "cafef00d", "created_at": created_at,
    })
}

/// A GitLab that lists `packages`, and answers each package's files from
/// `files` by package id.
fn gitlab(packages: Value, files: Vec<(u64, Value)>) -> TestServer {
    TestServer::start(move |request| {
        let target = request.target.as_str();
        if target.contains("/package_files") {
            let found = files
                .iter()
                .find(|(id, _)| target.contains(&format!("/packages/{id}/package_files")));
            return match found {
                Some((_, body)) => Reply::json(body.to_string()),
                None => Reply::status(404),
            };
        }
        Reply::json(packages.to_string())
    })
}

fn at(server: &TestServer) -> ResolveAuthLibertyOptions {
    ResolveAuthLibertyOptions {
        gitlab: Some(server.base.clone()),
        ..Default::default()
    }
}

fn options(server: &TestServer, hosts: AuthLibertyHosts) -> AuthLibertyOptions {
    AuthLibertyOptions {
        version: "0.3".to_owned(),
        gitlab: Some(server.base.clone()),
        hosts,
        ..Default::default()
    }
}

fn one_release() -> TestServer {
    gitlab(
        json!([package(100, "0.3", "2024-01-01T00:00:00Z")]),
        vec![(
            100,
            json!([file("authliberty-0.3.jar", "2024-01-01T00:00:00Z")]),
        )],
    )
}

#[test]
fn an_exact_version_resolves_to_a_release_with_a_download_url() {
    let server = one_release();
    let release = resolve_authliberty_version("0.3", &at(&server)).unwrap();

    assert_eq!(release.version, "0.3");
    assert_eq!(release.filename, "authliberty-0.3.jar");
    assert_eq!(release.size, 4096);
    assert_eq!(release.sha256.as_deref(), Some("cafef00d"));
    assert_eq!(
        release.url,
        format!(
            "{}/api/v4/projects/harmoniya%2Fauthliberty/packages/generic/authliberty/0.3/authliberty-0.3.jar",
            server.base
        )
    );
}

#[test]
fn the_project_path_travels_as_one_segment_in_both_requests() {
    let server = one_release();
    resolve_authliberty_version("0.3", &at(&server)).unwrap();

    assert_eq!(
        server.targets(),
        [
            "/api/v4/projects/harmoniya%2Fauthliberty/packages?package_type=generic&package_name=authliberty&per_page=100",
            "/api/v4/projects/harmoniya%2Fauthliberty/packages/100/package_files?per_page=100",
        ]
    );
}

#[test]
fn a_null_sha256_leaves_the_release_without_one() {
    let mut jar = file("authliberty-0.3.jar", "2024-01-01T00:00:00Z");
    jar["file_sha256"] = Value::Null;
    let server = gitlab(
        json!([package(100, "0.3", "2024-01-01T00:00:00Z")]),
        vec![(100, json!([jar]))],
    );

    let release = resolve_authliberty_version("0.3", &at(&server)).unwrap();
    assert_eq!(release.sha256, None);
    // And no integrity is invented for the artifact.
    let template = resolve_authliberty(&options(&server, Default::default())).unwrap();
    assert!(template.artifacts[0].integrity.is_none());
}

#[test]
fn packages_of_another_name_type_or_status_are_not_candidates() {
    let mut fuzzy = package(1, "0.3", "2025-01-01T00:00:00Z");
    fuzzy["name"] = json!("authliberty-extras");
    let mut maven = package(2, "0.3", "2025-01-01T00:00:00Z");
    maven["package_type"] = json!("maven");
    let mut processing = package(3, "0.3", "2025-01-01T00:00:00Z");
    processing["status"] = json!("processing");
    let server = gitlab(
        json!([
            fuzzy,
            maven,
            processing,
            package(100, "0.3", "2024-01-01T00:00:00Z")
        ]),
        vec![(
            100,
            json!([file("authliberty-0.3.jar", "2024-01-01T00:00:00Z")]),
        )],
    );

    // Each of the three is newer; only the fourth qualifies, and it is the
    // one whose files are asked for.
    resolve_authliberty_version("0.3", &at(&server)).unwrap();
    assert!(server.targets()[1].contains("/packages/100/"));
}

#[test]
fn a_republished_version_resolves_to_its_most_recent_package() {
    let server = gitlab(
        json!([
            package(100, "latest", "2024-01-01T00:00:00Z"),
            package(200, "latest", "2024-06-01T00:00:00Z"),
            package(150, "latest", "2024-03-01T00:00:00Z"),
        ]),
        vec![(
            200,
            json!([file("authliberty-latest.jar", "2024-06-01T00:00:00Z")]),
        )],
    );

    let release = resolve_authliberty_version("latest", &at(&server)).unwrap();
    assert_eq!(release.created_at, "2024-06-01T00:00:00Z");
    assert!(server.targets()[1].contains("/packages/200/"));
}

#[test]
fn the_most_recent_jar_is_taken_and_other_files_ignored() {
    let server = gitlab(
        json!([package(100, "0.3", "2024-01-01T00:00:00Z")]),
        vec![(
            100,
            json!([
                file("authliberty-0.3.jar", "2024-01-01T00:00:00Z"),
                file("authliberty-0.3.jar.sha256", "2024-09-01T00:00:00Z"),
                file("authliberty-0.3-fixed.jar", "2024-02-01T00:00:00Z"),
            ]),
        )],
    );

    let release = resolve_authliberty_version("0.3", &at(&server)).unwrap();
    assert_eq!(release.filename, "authliberty-0.3-fixed.jar");
}

#[test]
fn an_unknown_version_lists_what_the_registry_does_hold() {
    let server = gitlab(
        json!([
            package(1, "0.2", "2024-01-01T00:00:00Z"),
            package(2, "0.3", "2024-02-01T00:00:00Z"),
            package(3, "0.3", "2024-03-01T00:00:00Z"),
        ]),
        vec![],
    );
    let message = resolve_authliberty_version("9.9", &at(&server))
        .unwrap_err()
        .to_string();

    assert!(message.contains("'9.9'"), "{message}");
    assert!(message.contains("harmoniya/authliberty"), "{message}");
    // Each version once, however many times it was published.
    assert!(message.ends_with("Available: 0.2, 0.3"), "{message}");
}

#[test]
fn an_empty_registry_says_so() {
    let server = gitlab(json!([]), vec![]);
    let message = resolve_authliberty_version("0.3", &at(&server))
        .unwrap_err()
        .to_string();

    assert!(message.ends_with("Available: (none)"), "{message}");
}

#[test]
fn a_package_with_no_jar_is_an_error_naming_it() {
    let server = gitlab(
        json!([package(100, "0.3", "2024-01-01T00:00:00Z")]),
        vec![(100, json!([file("README.md", "2024-01-01T00:00:00Z")]))],
    );
    let message = resolve_authliberty_version("0.3", &at(&server))
        .unwrap_err()
        .to_string();

    assert_eq!(
        message,
        "AuthLiberty package harmoniya/authliberty@0.3 has no .jar file"
    );
}

#[test]
fn a_failing_api_call_is_reported_with_its_status() {
    let listing = TestServer::start(|_| Reply::status(500));
    let message = resolve_authliberty_version("0.3", &at(&listing))
        .unwrap_err()
        .to_string();
    assert!(message.contains("returned HTTP 500"), "{message}");

    // The files call failing, with the listing fine.
    let files = gitlab(json!([package(100, "0.3", "2024-01-01T00:00:00Z")]), vec![]);
    let message = resolve_authliberty_version("0.3", &at(&files))
        .unwrap_err()
        .to_string();
    assert!(message.contains("returned HTTP 404"), "{message}");
}

#[test]
fn a_token_is_sent_as_private_token_and_omitted_otherwise() {
    let server = one_release();
    resolve_authliberty_version("0.3", &at(&server)).unwrap();
    assert!(server
        .requests()
        .iter()
        .all(|r| r.header("private-token").is_none()));

    let server = one_release();
    let mut with_token = at(&server);
    with_token.token = Some("glpat-test".to_owned());
    resolve_authliberty_version("0.3", &with_token).unwrap();
    let requests = server.requests();
    assert_eq!(requests.len(), 2);
    assert!(requests
        .iter()
        .all(|r| r.header("private-token") == Some("glpat-test")));
}

#[test]
fn a_custom_project_and_a_base_with_trailing_slashes_are_honoured() {
    let server = one_release();
    let release = resolve_authliberty_version(
        "0.3",
        &ResolveAuthLibertyOptions {
            project: Some("my group/agent".to_owned()),
            gitlab: Some(format!("{}//", server.base)),
            token: None,
        },
    )
    .unwrap();

    assert!(server.targets()[0].starts_with("/api/v4/projects/my%20group%2Fagent/packages?"));
    assert!(release.url.starts_with(&format!(
        "{}/api/v4/projects/my%20group%2Fagent/",
        server.base
    )));
}

#[test]
fn the_jar_lands_at_a_maven_shaped_path_with_its_hash() {
    let server = one_release();
    let template = resolve_authliberty(&options(&server, Default::default())).unwrap();

    assert_eq!(template.artifacts.len(), 1);
    let artifact = &template.artifacts[0];
    assert_eq!(
        artifact.path,
        "${library_directory}/net/harmoniya/authliberty/0.3/authliberty-0.3.jar"
    );
    assert_eq!(artifact.size, Some(4096));
    let encoded = serde_json::to_value(artifact).unwrap();
    assert_eq!(encoded["integrity"], json!({ "sha256": "cafef00d" }));
    assert_eq!(template.release.version, "0.3");
}

#[test]
fn with_no_hosts_the_only_argument_is_the_agent() {
    let server = one_release();
    let template = resolve_authliberty(&options(&server, Default::default())).unwrap();

    let args: Vec<&str> = template
        .jvm_args
        .iter()
        .flat_map(|v| v.value.iter().map(String::as_str))
        .collect();
    assert_eq!(
        args,
        ["-javaagent:${library_directory}/net/harmoniya/authliberty/0.3/authliberty-0.3.jar"]
    );
}

#[test]
fn each_configured_host_becomes_its_property_in_a_fixed_order() {
    let server = one_release();
    let hosts = AuthLibertyHosts {
        services: Some("https://services.example".to_owned()),
        auth: Some("https://auth.example".to_owned()),
        account: Some("https://account.example".to_owned()),
        session: Some("https://session.example".to_owned()),
    };
    let template = resolve_authliberty(&options(&server, hosts)).unwrap();

    let args: Vec<&str> = template
        .jvm_args
        .iter()
        .skip(1)
        .flat_map(|v| v.value.iter().map(String::as_str))
        .collect();
    assert_eq!(
        args,
        [
            "-Dminecraft.api.auth.host=https://auth.example",
            "-Dminecraft.api.account.host=https://account.example",
            "-Dminecraft.api.session.host=https://session.example",
            "-Dminecraft.api.services.host=https://services.example",
        ]
    );
}

#[test]
fn a_host_left_out_or_left_empty_adds_nothing() {
    let server = one_release();
    let hosts = AuthLibertyHosts {
        auth: Some(String::new()),
        session: Some("https://session.example".to_owned()),
        ..Default::default()
    };
    let template = resolve_authliberty(&options(&server, hosts)).unwrap();

    assert_eq!(template.jvm_args.len(), 2);
    assert_eq!(
        template.jvm_args[1].value,
        ["-Dminecraft.api.session.host=https://session.example"]
    );
}

#[test]
fn the_plugin_contributes_the_jar_and_one_launch_group() {
    let server = one_release();
    let output = build_authliberty(&options(&server, Default::default())).unwrap();

    assert_eq!(output.name, "authliberty");
    assert_eq!(output.contribution.artifacts.len(), 1);
    let groups: Vec<&String> = output.contribution.launch.keys().collect();
    assert_eq!(groups, ["jvmArgs"]);
    assert!(output.contribution.vars.is_empty());
}

#[test]
fn options_and_template_roundtrip_through_json() {
    let server = one_release();
    let parsed: AuthLibertyOptions = serde_json::from_value(json!({
        "version": "0.3",
        "gitlab": server.base,
        "hosts": { "session": "https://session.example" },
    }))
    .unwrap();
    assert_eq!(
        parsed.hosts.session.as_deref(),
        Some("https://session.example")
    );

    let template = resolve_authliberty(&parsed).unwrap();
    let encoded = serde_json::to_string(&template).unwrap();
    let decoded: opys_authliberty::AuthLibertyTemplate = serde_json::from_str(&encoded).unwrap();
    assert_eq!(decoded, template);
}
