//! Resolving dgpuj against a stand-in GitHub: which release, which asset per
//! target, and the artifacts and vars made from them.

mod common;

use common::{Reply, TestServer};
use opys_core::{OsArch, OsName};
use opys_dgpuj::{build_dgpuj, default_platforms, resolve_dgpuj, DgpujOptions, DgpujPlatform};
use serde_json::{json, Value};

const TARGETS: [(&str, &str); 5] = [
    ("x86_64-pc-windows-msvc", "zip"),
    ("aarch64-pc-windows-msvc", "zip"),
    ("x86_64-unknown-linux-gnu", "tar.gz"),
    ("aarch64-apple-darwin", "tar.gz"),
    ("x86_64-apple-darwin", "tar.gz"),
];

fn release(
    base: &str,
    tag: &str,
    prerelease: bool,
    digest: bool,
    targets: &[(&str, &str)],
) -> Value {
    let assets: Vec<Value> = targets
        .iter()
        .enumerate()
        .map(|(i, (target, ext))| {
            let name = format!("dgpuj-{target}.{ext}");
            let mut asset = json!({ "name": name, "size": 1000 + i, "browser_download_url": format!("{base}/dl/{tag}/{name}") });
            if digest {
                asset["digest"] = json!(format!("sha256:{}", format!("{i:x}").repeat(64)));
            }
            asset
        })
        .collect();
    json!({ "tag_name": tag, "prerelease": prerelease, "draft": false, "published_at": "2026-01-01T00:00:00Z", "assets": assets })
}

fn github() -> TestServer {
    TestServer::start(|request| {
        let base = format!("http://{}", request.header("host").unwrap_or_default());
        let target = request.target.as_str();
        if target.starts_with("/repos/harmoniya-net/dgpuj/releases?") {
            return Reply::json(
                json!([
                    release(&base, "v0.4.0-rc", true, true, &TARGETS),
                    release(&base, "v0.3.0", false, true, &TARGETS)
                ])
                .to_string(),
            );
        }
        if target == "/repos/harmoniya-net/dgpuj/releases/tags/v0.1.0" {
            // An old release: no digests, and only the Linux build.
            return Reply::json(release(&base, "v0.1.0", false, false, &TARGETS[2..3]).to_string());
        }
        if target == "/repos/fork/dgpuj/releases/tags/v9" {
            return Reply::json(release(&base, "v9", false, true, &TARGETS).to_string());
        }
        if target.starts_with("/dl/v0.1.0/") {
            return Reply::json("hello");
        }
        Reply::status(404)
    })
}

fn options(server: &TestServer) -> DgpujOptions {
    DgpujOptions {
        api_base: Some(server.base.clone()),
        ..Default::default()
    }
}

fn linux() -> Vec<DgpujPlatform> {
    default_platforms()
        .into_iter()
        .filter(|p| p.os == OsName::Linux)
        .collect()
}

#[test]
fn every_published_target_becomes_an_os_and_arch_scoped_archive_that_unpacks_the_binary() {
    let server = github();
    let template = resolve_dgpuj(&options(&server)).unwrap();

    assert_eq!(template.artifacts.len(), 5);
    let windows = serde_json::to_value(&template.artifacts[0]).unwrap();
    assert_eq!(
        windows,
        json!({
            "path": "${dgpuj_dir}/dgpuj-x86_64-pc-windows-msvc.zip",
            "source": { "url": format!("{}/dl/v0.3.0/dgpuj-x86_64-pc-windows-msvc.zip", server.base) },
            "size": 1000,
            "rules": ["allow.os.windows", "allow.arch.x86_64"],
            "integrity": { "sha256": "0".repeat(64) },
            "extract": { "file": "dgpuj.exe", "into": "${dgpuj_dir}/dgpuj.exe" },
        })
    );
    let mac = serde_json::to_value(&template.artifacts[3]).unwrap();
    assert_eq!(mac["rules"], json!(["allow.os.osx", "allow.arch.aarch64"]));
    assert_eq!(
        mac["extract"],
        json!({ "file": "dgpuj", "into": "${dgpuj_dir}/dgpuj" })
    );
}

#[test]
fn the_vars_are_a_directory_and_one_binary_path_per_os() {
    let server = github();
    let template = resolve_dgpuj(&options(&server)).unwrap();

    assert_eq!(
        serde_json::to_value(&template.vars).unwrap(),
        json!({
            "dgpuj_dir": "${root}/dgpuj",
            // One arm per OS, though Windows and macOS each have two targets.
            "dgpuj_bin": [
                { "value": "${dgpuj_dir}/dgpuj.exe", "rules": "allow.os.windows" },
                { "value": "${dgpuj_dir}/dgpuj", "rules": "allow.os.linux" },
                { "value": "${dgpuj_dir}/dgpuj", "rules": "allow.os.osx" },
            ],
        })
    );
}

#[test]
fn the_default_is_the_newest_stable_release() {
    let server = github();
    let template = resolve_dgpuj(&options(&server)).unwrap();

    assert_eq!(template.release.tag_name, "v0.3.0");
    assert_eq!(
        server.targets(),
        ["/repos/harmoniya-net/dgpuj/releases?per_page=100"]
    );
}

#[test]
fn prerelease_takes_the_newest_of_all_and_a_tag_is_fetched_by_tag() {
    let server = github();
    let with = |version: &str| {
        let mut o = options(&server);
        o.version = Some(version.to_owned());
        o.platforms = Some(linux());
        resolve_dgpuj(&o).unwrap().release.tag_name
    };

    assert_eq!(with("latest"), "v0.3.0");
    assert_eq!(with("prerelease"), "v0.4.0-rc");
    assert_eq!(with("v0.1.0"), "v0.1.0");
    assert!(server
        .targets()
        .contains(&"/repos/harmoniya-net/dgpuj/releases/tags/v0.1.0".to_owned()));
}

#[test]
fn an_archive_github_has_no_digest_for_is_hashed_rather_than_shipped_unverified() {
    let server = github();
    let mut o = options(&server);
    o.version = Some("v0.1.0".to_owned());
    o.platforms = Some(linux());
    let template = resolve_dgpuj(&o).unwrap();

    let artifact = serde_json::to_value(&template.artifacts[0]).unwrap();
    // sha256("hello"), and the size that was read rather than the one listed.
    assert_eq!(
        artifact["integrity"],
        json!({ "sha256": "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824" })
    );
    assert_eq!(artifact["size"], 5);
}

#[test]
fn a_release_missing_a_target_names_it_and_what_is_there() {
    let server = github();
    let mut o = options(&server);
    o.version = Some("v0.1.0".to_owned());
    let message = resolve_dgpuj(&o).unwrap_err().to_string();

    assert_eq!(
        message,
        "No matching asset (dgpuj-x86_64-pc-windows-msvc.zip) on GitHub release v0.1.0. \
         Assets: dgpuj-x86_64-unknown-linux-gnu.tar.gz"
    );
}

#[test]
fn the_repo_and_the_platform_set_can_be_replaced() {
    let server = github();
    let mut o = options(&server);
    o.repo = Some("fork/dgpuj".to_owned());
    o.version = Some("v9".to_owned());
    o.platforms = Some(vec![DgpujPlatform {
        os: OsName::Linux,
        arch: OsArch::X86_64,
        target: "x86_64-unknown-linux-gnu".to_owned(),
        ext: "tar.gz".to_owned(),
        bin: "dgpuj".to_owned(),
    }]);
    let template = resolve_dgpuj(&o).unwrap();

    assert_eq!(server.targets(), ["/repos/fork/dgpuj/releases/tags/v9"]);
    assert_eq!(template.artifacts.len(), 1);
    assert_eq!(
        serde_json::to_value(&template.vars["dgpuj_bin"])
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn a_token_is_sent_as_a_bearer() {
    let server = github();
    let mut o = options(&server);
    o.token = Some("ghp_test".to_owned());
    resolve_dgpuj(&o).unwrap();

    assert_eq!(
        server.requests()[0].header("authorization"),
        Some("Bearer ghp_test")
    );
}

#[test]
fn the_plugin_exposes_the_binary_and_where_the_jvm_is() {
    let server = github();
    let build = build_dgpuj(&options(&server)).unwrap();

    assert_eq!(build.output.name, "dgpuj");
    assert_eq!(build.output.contribution.artifacts.len(), 5);
    let launch = serde_json::to_value(&build.output.contribution.launch).unwrap();
    assert_eq!(launch["bin"], "${dgpuj_bin}");
    assert_eq!(
        launch["home"],
        json!({ "rules": [], "value": ["--dgpuj-home", "${java_home}"] })
    );
    // One resolve for both: the release the log line names comes with it.
    assert_eq!(build.release.tag_name, "v0.3.0");
    assert_eq!(server.targets().len(), 1);
}

#[test]
fn the_default_platforms_are_dgpujs_five_targets() {
    let named: Vec<(String, String)> = default_platforms()
        .into_iter()
        .map(|p| (p.target, p.ext))
        .collect();
    let expected: Vec<(String, String)> = TARGETS
        .iter()
        .map(|(t, e)| ((*t).to_owned(), (*e).to_owned()))
        .collect();
    assert_eq!(named, expected);
}

#[test]
fn options_and_template_roundtrip_through_json() {
    let server = github();
    let parsed: DgpujOptions = serde_json::from_value(json!({
        "apiBase": server.base,
        "version": "prerelease",
        "platforms": [{ "os": "linux", "arch": "x86_64", "target": "x86_64-unknown-linux-gnu", "ext": "tar.gz", "bin": "dgpuj" }],
    }))
    .unwrap();
    let template = resolve_dgpuj(&parsed).unwrap();
    assert_eq!(template.release.tag_name, "v0.4.0-rc");

    let encoded = serde_json::to_string(&template).unwrap();
    let decoded: opys_dgpuj::DgpujTemplate = serde_json::from_str(&encoded).unwrap();
    assert_eq!(decoded, template);
}
