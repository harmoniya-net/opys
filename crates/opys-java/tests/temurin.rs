//! Adoptium resolver, against a local stand-in for `api.adoptium.net`.

mod common;

use common::{Reply, Request, TestServer};
use opys_core::OsName;
use opys_java::{
    resolve_temurin, Platform, ResolveTemurinOptions, SupportedArch, DEFAULT_PLATFORMS,
};

const LINUX_X64: Platform = Platform {
    os: OsName::Linux,
    arch: SupportedArch::X86_64,
};
const MAC_AARCH64: Platform = Platform {
    os: OsName::Osx,
    arch: SupportedArch::Aarch64,
};
const WIN_X64: Platform = Platform {
    os: OsName::Windows,
    arch: SupportedArch::X86_64,
};

/// One Adoptium-shaped release for a given platform.
fn release(platform: Platform, release_name: &str, major: u32) -> String {
    let os = match platform.os {
        OsName::Linux => "linux",
        OsName::Osx => "mac",
        OsName::Windows => "windows",
    };
    let arch = match platform.arch {
        SupportedArch::X86_64 => "x64",
        SupportedArch::Aarch64 => "aarch64",
    };
    format!(
        r#"{{
          "release_name": "{release_name}",
          "version_data": {{ "major": {major} }},
          "binaries": [{{
            "architecture": "{arch}",
            "os": "{os}",
            "image_type": "jdk",
            "jvm_impl": "hotspot",
            "package": {{
              "checksum": "abc123",
              "link": "https://github.com/adoptium/{release_name}-{os}-{arch}.tar.gz",
              "name": "OpenJDK21U-jdk_{arch}_{os}_hotspot.tar.gz",
              "size": 12345
            }}
          }}]
        }}"#
    )
}

fn ga_release(platform: Platform) -> String {
    release(platform, "jdk-21.0.11+10", 21)
}

fn options(server: &TestServer, platforms: &[Platform]) -> ResolveTemurinOptions {
    ResolveTemurinOptions {
        platforms: Some(platforms.to_vec()),
        api_base: Some(server.base.clone()),
    }
}

/// Answer any request for `os=<name>` with that platform's release.
fn serve_platforms(pairs: &'static [(&'static str, Platform)]) -> impl Fn(&Request) -> Reply {
    move |req: &Request| match pairs.iter().find(|(os, _)| req.target.contains(*os)) {
        Some((_, platform)) => Reply::json(format!("[{}]", ga_release(*platform))),
        None => Reply::status(404),
    }
}

#[test]
fn default_platforms_cover_three_oses_across_two_arches() {
    assert_eq!(DEFAULT_PLATFORMS.len(), 6);
    let mut keys: Vec<String> = DEFAULT_PLATFORMS
        .iter()
        .map(|p| format!("{:?}/{:?}", p.os, p.arch))
        .collect();
    keys.sort();
    assert_eq!(
        keys,
        [
            "Linux/Aarch64",
            "Linux/X86_64",
            "Osx/Aarch64",
            "Osx/X86_64",
            "Windows/Aarch64",
            "Windows/X86_64",
        ]
    );
}

// ── version input shapes ──────────────────────────────────────────────────

#[test]
fn uses_the_feature_releases_endpoint_for_a_major_only_version() {
    let server = TestServer::start(serve_platforms(&[("os=linux", LINUX_X64)]));
    resolve_temurin("21", &options(&server, &[LINUX_X64])).unwrap();
    let target = &server.targets()[0];
    assert!(
        target.starts_with("/assets/feature_releases/21/ga?"),
        "{target}"
    );
    assert!(target.contains("page_size=1"), "{target}");
    assert!(target.contains("sort_order=DESC"), "{target}");
}

#[test]
fn uses_the_release_name_endpoint_for_a_full_version() {
    let server = TestServer::start(serve_platforms(&[("os=linux", LINUX_X64)]));
    resolve_temurin("21.0.11+10", &options(&server, &[LINUX_X64])).unwrap();
    let target = &server.targets()[0];
    // `+` has to survive as `%2B` or Adoptium reads it as a space.
    assert!(
        target.starts_with("/assets/release_name/eclipse/jdk-21.0.11%2B10?"),
        "{target}"
    );
}

#[test]
fn accepts_the_four_full_version_spellings() {
    for (input, expected) in [
        ("21.0.11+10", "jdk-21.0.11%2B10"),
        ("jdk-21.0.11+10", "jdk-21.0.11%2B10"),
        ("8u492-b09", "jdk8u492-b09"),
        ("jdk8u492-b09", "jdk8u492-b09"),
    ] {
        let server = TestServer::start(serve_platforms(&[("os=linux", LINUX_X64)]));
        resolve_temurin(input, &options(&server, &[LINUX_X64])).unwrap();
        let target = &server.targets()[0];
        assert!(
            target.starts_with(&format!("/assets/release_name/eclipse/{expected}?")),
            "{input} → {target}"
        );
    }
}

#[test]
fn strips_an_lts_suffix_and_surrounding_whitespace() {
    for input in ["21-LTS", "  21  "] {
        let server = TestServer::start(serve_platforms(&[("os=linux", LINUX_X64)]));
        resolve_temurin(input, &options(&server, &[LINUX_X64])).unwrap();
        let target = &server.targets()[0];
        assert!(
            target.starts_with("/assets/feature_releases/21/ga?"),
            "{input} → {target}"
        );
    }
}

// ── binary resolution ─────────────────────────────────────────────────────

#[test]
fn maps_adoptium_package_fields_onto_a_vendor_binary() {
    let server = TestServer::start(serve_platforms(&[("os=linux", LINUX_X64)]));
    let result = resolve_temurin("21", &options(&server, &[LINUX_X64])).unwrap();

    assert_eq!(result.label, "Temurin 21.0.11+10");
    assert_eq!(result.major, 21);
    let binary = &result.binaries[0];
    assert_eq!(binary.platform, LINUX_X64);
    assert_eq!(binary.filename, "OpenJDK21U-jdk_x64_linux_hotspot.tar.gz");
    assert_eq!(
        binary.url,
        "https://github.com/adoptium/jdk-21.0.11+10-linux-x64.tar.gz"
    );
    assert_eq!(binary.size, 12345);
    assert_eq!(binary.sha256.as_deref(), Some("abc123"));
    assert!(binary.discovery.is_none());
}

#[test]
fn resolves_several_platforms_from_one_release() {
    let server = TestServer::start(serve_platforms(&[
        ("os=linux", LINUX_X64),
        ("os=mac", MAC_AARCH64),
    ]));
    let result = resolve_temurin("21", &options(&server, &[LINUX_X64, MAC_AARCH64])).unwrap();
    assert_eq!(result.binaries.len(), 2);
    assert_eq!(result.binaries[0].platform, LINUX_X64);
    assert_eq!(result.binaries[1].platform, MAC_AARCH64);
}

#[test]
fn soft_skips_a_platform_the_release_does_not_ship() {
    // mac 404s; the resolve still succeeds on linux alone.
    let server = TestServer::start(serve_platforms(&[("os=linux", LINUX_X64)]));
    let result = resolve_temurin("21", &options(&server, &[LINUX_X64, MAC_AARCH64])).unwrap();
    assert_eq!(result.binaries.len(), 1);
    assert_eq!(result.binaries[0].platform, LINUX_X64);
}

#[test]
fn soft_skips_bodies_that_carry_no_usable_binary() {
    let cases = [
        // No `binaries` key at all.
        r#"[{"release_name":"jdk-21.0.11+10","version_data":{"major":21}}]"#,
        // Present but empty.
        r#"[{"release_name":"jdk-21.0.11+10","version_data":{"major":21},"binaries":[]}]"#,
        // A binary for a different arch than the one queried.
        r#"[{"release_name":"jdk-21.0.11+10","version_data":{"major":21},"binaries":[
             {"architecture":"aarch64","os":"linux","image_type":"jdk","jvm_impl":"hotspot",
              "package":{"checksum":"x","link":"https://x","name":"x.tar.gz","size":1}}]}]"#,
        // A JRE where a JDK was asked for.
        r#"[{"release_name":"jdk-21.0.11+10","version_data":{"major":21},"binaries":[
             {"architecture":"x64","os":"linux","image_type":"jre","jvm_impl":"hotspot",
              "package":{"checksum":"x","link":"https://x","name":"x.tar.gz","size":1}}]}]"#,
        // An empty list.
        "[]",
    ];
    for body in cases {
        let server = TestServer::start(move |_: &Request| Reply::json(body));
        let err = resolve_temurin("21", &options(&server, &[LINUX_X64])).unwrap_err();
        assert!(
            err.to_string().contains("No Temurin binaries found"),
            "{body} → {err}"
        );
    }
}

#[test]
fn handles_a_single_release_object_rather_than_a_list() {
    let body = ga_release(LINUX_X64);
    let server = TestServer::start(move |_: &Request| Reply::json(body.clone()));
    let result = resolve_temurin("21.0.11+10", &options(&server, &[LINUX_X64])).unwrap();
    assert_eq!(result.binaries.len(), 1);
}

// ── release-name anchoring ────────────────────────────────────────────────

#[test]
fn anchors_on_the_most_common_release_name_and_drops_the_rest() {
    // linux + windows agree on jdk-21.0.11+10; mac resolved a different GA.
    let server = TestServer::start(|req: &Request| {
        if req.target.contains("os=linux") {
            Reply::json(format!("[{}]", ga_release(LINUX_X64)))
        } else if req.target.contains("os=windows") {
            Reply::json(format!("[{}]", ga_release(WIN_X64)))
        } else if req.target.contains("os=mac") {
            Reply::json(format!("[{}]", release(MAC_AARCH64, "jdk-21.0.10+7", 21)))
        } else {
            Reply::status(404)
        }
    });
    let result =
        resolve_temurin("21", &options(&server, &[LINUX_X64, WIN_X64, MAC_AARCH64])).unwrap();

    assert_eq!(result.label, "Temurin 21.0.11+10");
    assert_eq!(result.binaries.len(), 2);
    assert!(result.binaries.iter().all(|b| b.platform.os != OsName::Osx));
}

#[test]
fn breaks_a_tie_on_the_lexicographically_larger_name() {
    let server = TestServer::start(|req: &Request| {
        if req.target.contains("os=linux") {
            Reply::json(format!("[{}]", release(LINUX_X64, "jdk-21.0.1+1", 21)))
        } else if req.target.contains("os=mac") {
            Reply::json(format!("[{}]", release(MAC_AARCH64, "jdk-21.0.2+2", 21)))
        } else {
            Reply::status(404)
        }
    });
    let result = resolve_temurin("21", &options(&server, &[LINUX_X64, MAC_AARCH64])).unwrap();
    assert_eq!(result.label, "Temurin 21.0.2+2");
    assert_eq!(result.binaries.len(), 1);
}

// ── errors ────────────────────────────────────────────────────────────────

#[test]
fn reports_a_version_no_platform_carries() {
    let server = TestServer::start(|_: &Request| Reply::status(404));
    let err = resolve_temurin("99", &options(&server, &[LINUX_X64])).unwrap_err();
    assert_eq!(
        err.to_string(),
        "No Temurin binaries found for version '99' across requested platforms."
    );
}

#[test]
fn names_the_failing_platform_on_a_non_404_status() {
    let server = TestServer::start(|_: &Request| Reply::status(403));
    let err = resolve_temurin("21", &options(&server, &[MAC_AARCH64])).unwrap_err();
    assert_eq!(err.to_string(), "Adoptium API 403 for mac/aarch64");
}

#[test]
fn reports_a_body_it_cannot_read() {
    let server = TestServer::start(|_: &Request| Reply::json("{ not json"));
    let err = resolve_temurin("21", &options(&server, &[LINUX_X64])).unwrap_err();
    assert!(
        err.to_string()
            .starts_with("Adoptium returned an unreadable response for linux/x64"),
        "{err}"
    );
}

// ── options ───────────────────────────────────────────────────────────────

#[test]
fn queries_every_default_platform_when_none_are_given() {
    let server = TestServer::start(|_: &Request| Reply::status(404));
    let _ = resolve_temurin(
        "21",
        &ResolveTemurinOptions {
            platforms: None,
            api_base: Some(server.base.clone()),
        },
    );
    assert_eq!(server.requests().len(), 6);
}

#[test]
fn sends_a_json_accept_header() {
    let server = TestServer::start(serve_platforms(&[("os=linux", LINUX_X64)]));
    resolve_temurin("21", &options(&server, &[LINUX_X64])).unwrap();
    assert_eq!(
        server.requests()[0].header("accept"),
        Some("application/json")
    );
}
