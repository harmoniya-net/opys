//! GraalVM CE resolver, against a local stand-in for `api.github.com`.

mod common;

use common::{Reply, Request, TestServer};
use opys_core::OsName;
use opys_java::{resolve_graalvm, Platform, ResolveGraalvmOptions, SupportedArch};

const LINUX_X64: Platform = Platform {
    os: OsName::Linux,
    arch: SupportedArch::X86_64,
};
const MAC_AARCH64: Platform = Platform {
    os: OsName::Osx,
    arch: SupportedArch::Aarch64,
};
const WIN_AARCH64: Platform = Platform {
    os: OsName::Windows,
    arch: SupportedArch::Aarch64,
};

fn asset(name: &str, digest: Option<&str>) -> String {
    let digest = match digest {
        Some(d) => format!(r#", "digest": "sha256:{d}""#),
        None => String::new(),
    };
    format!(
        r#"{{"name":"{name}","size":999,
            "browser_download_url":"https://github.com/graalvm/{name}"{digest}}}"#
    )
}

/// A release carrying the linux-x64 and macos-aarch64 archives.
fn release(tag: &str, prerelease: bool) -> String {
    format!(
        r#"{{
          "tag_name": "{tag}",
          "prerelease": {prerelease},
          "draft": false,
          "published_at": "2024-01-01T00:00:00Z",
          "assets": [
            {},
            {},
            {}
          ]
        }}"#,
        asset(
            &format!("graalvm-community-{tag}_linux-x64_bin.tar.gz.sha256"),
            None
        ),
        asset(
            &format!("graalvm-community-{tag}_linux-x64_bin.tar.gz"),
            Some("aaa111")
        ),
        asset(
            &format!("graalvm-community-{tag}_macos-aarch64_bin.tar.gz"),
            Some("bbb222")
        ),
    )
}

fn options(server: &TestServer, platforms: &[Platform]) -> ResolveGraalvmOptions {
    ResolveGraalvmOptions {
        platforms: Some(platforms.to_vec()),
        token: None,
        api_base: Some(server.base.clone()),
    }
}

fn serve(body: String) -> impl Fn(&Request) -> Reply {
    move |_: &Request| Reply::json(body.clone())
}

// ── version input shapes ──────────────────────────────────────────────────

#[test]
fn picks_the_newest_matching_tag_for_a_major_only_version() {
    let server = TestServer::start(serve(format!(
        "[{},{},{}]",
        release("jdk-22.0.1", false),
        release("jdk-21.0.4", false),
        release("jdk-21.0.2", false),
    )));
    let result = resolve_graalvm("21", &options(&server, &[LINUX_X64])).unwrap();
    assert_eq!(result.label, "GraalVM CE 21.0.4");
    assert_eq!(result.major, 21);
    assert_eq!(
        server.targets()[0],
        "/repos/graalvm/graalvm-ce-builds/releases?per_page=100"
    );
}

#[test]
fn matches_a_bare_dotted_version_by_prefixing_the_tag() {
    let server = TestServer::start(serve(format!(
        "[{},{}]",
        release("jdk-21.0.4", false),
        release("jdk-21.0.2", false),
    )));
    let result = resolve_graalvm("21.0.2", &options(&server, &[LINUX_X64])).unwrap();
    assert_eq!(result.label, "GraalVM CE 21.0.2");
}

#[test]
fn accepts_a_tag_shaped_version_verbatim() {
    let server = TestServer::start(serve(format!("[{}]", release("jdk-21.0.2", false))));
    let result = resolve_graalvm("jdk-21.0.2", &options(&server, &[LINUX_X64])).unwrap();
    assert_eq!(result.label, "GraalVM CE 21.0.2");
}

#[test]
fn reports_a_tag_that_does_not_exist() {
    let server = TestServer::start(serve(format!("[{}]", release("jdk-21.0.2", false))));
    let err = resolve_graalvm("jdk-99.0.0", &options(&server, &[LINUX_X64])).unwrap_err();
    assert_eq!(
        err.to_string(),
        "GitHub release 'jdk-99.0.0' not found in graalvm/graalvm-ce-builds. \
         Available: jdk-21.0.2"
    );
}

#[test]
fn rejects_an_innovation_tag_with_a_clear_message() {
    // `graal-*` releases exist, but their numbering doesn't embed the JDK
    // major, so the major this resolver has to report can't be derived.
    let server = TestServer::start(serve(format!("[{}]", release("graal-25.2.4", false))));
    let err = resolve_graalvm("graal-25.2.4", &options(&server, &[LINUX_X64])).unwrap_err();
    assert!(
        err.to_string().contains(
            "GraalVM release 'graal-25.2.4' doesn't use the standard 'jdk-<major>.…' tag"
        ),
        "{err}"
    );
}

// ── binary resolution ─────────────────────────────────────────────────────

#[test]
fn maps_asset_fields_onto_a_vendor_binary_using_the_inline_digest() {
    let server = TestServer::start(serve(format!("[{}]", release("jdk-21.0.2", false))));
    let result = resolve_graalvm("21", &options(&server, &[LINUX_X64])).unwrap();

    let binary = &result.binaries[0];
    assert_eq!(
        binary.filename,
        "graalvm-community-jdk-21.0.2_linux-x64_bin.tar.gz"
    );
    assert_eq!(
        binary.url,
        "https://github.com/graalvm/graalvm-community-jdk-21.0.2_linux-x64_bin.tar.gz"
    );
    assert_eq!(binary.size, 999);
    assert_eq!(binary.sha256.as_deref(), Some("aaa111"));
    // With an inline digest there is nothing left to discover at install time.
    assert!(binary.discovery.is_none());
}

#[test]
fn falls_back_to_the_sha256_sidecar_when_github_computed_no_digest() {
    let body = format!(
        r#"[{{"tag_name":"jdk-21.0.2","prerelease":false,"draft":false,
              "published_at":"2024-01-01T00:00:00Z","assets":[{}]}}]"#,
        asset("graalvm-community-jdk-21.0.2_linux-x64_bin.tar.gz", None)
    );
    let server = TestServer::start(serve(body));
    let result = resolve_graalvm("21", &options(&server, &[LINUX_X64])).unwrap();

    let binary = &result.binaries[0];
    assert!(binary.sha256.is_none());
    let probe = binary
        .discovery
        .as_ref()
        .and_then(|d| d.integrity.as_ref())
        .and_then(|i| i.url.as_ref())
        .expect("a url integrity probe");
    assert_eq!(probe.location(), "${url}.sha256");
}

#[test]
fn resolves_several_platforms_from_one_release() {
    let server = TestServer::start(serve(format!("[{}]", release("jdk-21.0.2", false))));
    let result = resolve_graalvm("21", &options(&server, &[LINUX_X64, MAC_AARCH64])).unwrap();
    assert_eq!(result.binaries.len(), 2);
}

#[test]
fn soft_skips_a_platform_the_release_does_not_publish() {
    let server = TestServer::start(serve(format!("[{}]", release("jdk-21.0.2", false))));
    let result = resolve_graalvm("21", &options(&server, &[LINUX_X64, WIN_AARCH64])).unwrap();
    assert_eq!(result.binaries.len(), 1);
    assert_eq!(result.binaries[0].platform, LINUX_X64);
}

#[test]
fn reports_a_release_with_no_asset_for_any_requested_platform() {
    let server = TestServer::start(serve(format!("[{}]", release("jdk-21.0.2", false))));
    let err = resolve_graalvm("21", &options(&server, &[WIN_AARCH64])).unwrap_err();
    assert_eq!(
        err.to_string(),
        "No GraalVM CE binaries found for version '21' across requested platforms."
    );
}

#[test]
fn skips_prereleases_and_drafts_when_selecting_the_latest() {
    let body = format!(
        "[{},{},{}]",
        release("jdk-21.0.9", true),
        r#"{"tag_name":"jdk-21.0.8","prerelease":false,"draft":true,"assets":[]}"#,
        release("jdk-21.0.4", false),
    );
    let server = TestServer::start(serve(body));
    let result = resolve_graalvm("21", &options(&server, &[LINUX_X64])).unwrap();
    assert_eq!(result.label, "GraalVM CE 21.0.4");
}

// ── options ───────────────────────────────────────────────────────────────

#[test]
fn queries_every_default_platform_when_none_are_given() {
    let server = TestServer::start(serve(format!("[{}]", release("jdk-21.0.2", false))));
    let result = resolve_graalvm(
        "21",
        &ResolveGraalvmOptions {
            platforms: None,
            token: None,
            api_base: Some(server.base.clone()),
        },
    )
    .unwrap();
    // One listing request serves every platform — nothing to fan out.
    assert_eq!(server.requests().len(), 1);
    assert_eq!(result.binaries.len(), 2);
}

#[test]
fn forwards_a_token_as_a_bearer_header() {
    let server = TestServer::start(serve(format!("[{}]", release("jdk-21.0.2", false))));
    resolve_graalvm(
        "21",
        &ResolveGraalvmOptions {
            platforms: Some(vec![LINUX_X64]),
            token: Some("s3cret".to_owned()),
            api_base: Some(server.base.clone()),
        },
    )
    .unwrap();
    let request = &server.requests()[0];
    assert_eq!(request.header("authorization"), Some("Bearer s3cret"));
    assert_eq!(request.header("x-github-api-version"), Some("2022-11-28"));
}

#[test]
fn reports_a_non_2xx_listing() {
    let server = TestServer::start(|_: &Request| Reply::status(403));
    let err = resolve_graalvm("21", &options(&server, &[LINUX_X64])).unwrap_err();
    assert_eq!(
        err.to_string(),
        "GitHub API 403 listing graalvm/graalvm-ce-builds releases"
    );
}
