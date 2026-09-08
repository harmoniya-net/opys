//! Azul resolver, against a local stand-in for `api.azul.com`.

mod common;

use common::{Reply, Request, TestServer};
use opys_core::OsName;
use opys_java::{resolve_zulu, Platform, ResolveZuluOptions, SupportedArch};

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

/// One Azul-shaped package.
fn package(name: &str, java_version: &str, distro_version: &str) -> String {
    let tuple = |v: &str| v.split('.').collect::<Vec<_>>().join(", ");
    format!(
        r#"{{
          "name": "{name}",
          "download_url": "https://cdn.azul.com/{name}",
          "size": 4242,
          "sha256_hash": "deadbeef",
          "java_version": [{}],
          "distro_version": [{}]
        }}"#,
        tuple(java_version),
        tuple(distro_version)
    )
}

fn options(server: &TestServer, platforms: &[Platform]) -> ResolveZuluOptions {
    ResolveZuluOptions {
        platforms: Some(platforms.to_vec()),
        api_base: Some(server.base.clone()),
    }
}

fn one_package(name: &str) -> impl Fn(&Request) -> Reply {
    let body = format!("[{}]", package(name, "21.0.5", "21.38.21"));
    move |_: &Request| Reply::json(body.clone())
}

// ── query construction ────────────────────────────────────────────────────

#[test]
fn queries_linux_glibc_with_a_tarball() {
    let server = TestServer::start(one_package("zulu-linux.tar.gz"));
    resolve_zulu("21", &options(&server, &[LINUX_X64])).unwrap();

    let target = &server.targets()[0];
    assert!(target.starts_with("/zulu/packages/?"), "{target}");
    assert!(target.contains("os=linux-glibc"), "{target}");
    assert!(target.contains("arch=x64"), "{target}");
    assert!(target.contains("archive_type=tar.gz"), "{target}");
    assert!(target.contains("java_package_type=jdk"), "{target}");
    assert!(target.contains("javafx_bundled=false"), "{target}");
    assert!(target.contains("crac_supported=false"), "{target}");
    assert!(target.contains("release_status=ga"), "{target}");
    assert!(target.contains("availability_types=CA"), "{target}");
    assert!(target.contains("include_fields=sha256_hash"), "{target}");
    assert!(target.contains("include_fields=size"), "{target}");
}

#[test]
fn queries_windows_with_a_zip() {
    let server = TestServer::start(one_package("zulu-win.zip"));
    resolve_zulu("21", &options(&server, &[WIN_X64])).unwrap();
    assert!(server.targets()[0].contains("archive_type=zip"));
}

#[test]
fn passes_a_full_version_straight_through() {
    let server = TestServer::start(one_package("zulu-linux.tar.gz"));
    resolve_zulu("21.0.5", &options(&server, &[LINUX_X64])).unwrap();
    assert!(server.targets()[0].contains("java_version=21.0.5"));
}

// ── binary resolution ─────────────────────────────────────────────────────

#[test]
fn maps_azul_package_fields_onto_a_vendor_binary() {
    let server = TestServer::start(one_package("zulu21.38.21-ca-jdk21.0.5-linux_x64.tar.gz"));
    let result = resolve_zulu("21", &options(&server, &[LINUX_X64])).unwrap();

    assert_eq!(result.label, "Zulu 21.38.21 (JDK 21.0.5)");
    assert_eq!(result.major, 21);
    let binary = &result.binaries[0];
    assert_eq!(binary.platform, LINUX_X64);
    assert_eq!(
        binary.filename,
        "zulu21.38.21-ca-jdk21.0.5-linux_x64.tar.gz"
    );
    assert_eq!(
        binary.url,
        "https://cdn.azul.com/zulu21.38.21-ca-jdk21.0.5-linux_x64.tar.gz"
    );
    assert_eq!(binary.size, 4242);
    assert_eq!(binary.sha256.as_deref(), Some("deadbeef"));
}

#[test]
fn resolves_several_platforms_at_the_same_java_version() {
    let server = TestServer::start(|req: &Request| {
        if req.target.contains("os=linux-glibc") {
            Reply::json(format!(
                "[{}]",
                package("linux.tar.gz", "21.0.5", "21.38.21")
            ))
        } else if req.target.contains("os=macos") {
            Reply::json(format!("[{}]", package("mac.tar.gz", "21.0.5", "21.38.21")))
        } else {
            Reply::status(404)
        }
    });
    let result = resolve_zulu("21", &options(&server, &[LINUX_X64, MAC_AARCH64])).unwrap();
    assert_eq!(result.binaries.len(), 2);
}

#[test]
fn soft_skips_a_platform_with_no_packages() {
    for empty in ["[]", ""] {
        let server = TestServer::start(move |req: &Request| {
            if req.target.contains("os=linux-glibc") {
                Reply::json(format!(
                    "[{}]",
                    package("linux.tar.gz", "21.0.5", "21.38.21")
                ))
            } else if empty.is_empty() {
                Reply::status(404)
            } else {
                Reply::json(empty)
            }
        });
        let result = resolve_zulu("21", &options(&server, &[LINUX_X64, MAC_AARCH64])).unwrap();
        assert_eq!(result.binaries.len(), 1, "empty body: {empty:?}");
    }
}

#[test]
fn sorts_candidates_newest_first_regardless_of_api_order() {
    let body = format!(
        "[{},{},{}]",
        package("old.tar.gz", "21.0.1", "21.30.1"),
        package("new.tar.gz", "21.0.9", "21.38.21"),
        package("mid.tar.gz", "21.0.5", "21.34.1"),
    );
    let server = TestServer::start(move |_: &Request| Reply::json(body.clone()));
    let result = resolve_zulu("21", &options(&server, &[LINUX_X64])).unwrap();
    assert_eq!(result.binaries[0].filename, "new.tar.gz");
    assert_eq!(result.label, "Zulu 21.38.21 (JDK 21.0.9)");
}

// ── anchoring ─────────────────────────────────────────────────────────────

#[test]
fn anchors_every_platform_on_the_version_most_of_them_agree_on() {
    // linux + windows both have 21.0.5; mac's newest is 21.0.9, but it also
    // carries 21.0.5, so it joins the anchor rather than being dropped.
    let server = TestServer::start(|req: &Request| {
        if req.target.contains("os=macos") {
            Reply::json(format!(
                "[{},{}]",
                package("mac-new.tar.gz", "21.0.9", "21.38.21"),
                package("mac-old.tar.gz", "21.0.5", "21.34.1"),
            ))
        } else {
            Reply::json(format!(
                "[{}]",
                package("other.tar.gz", "21.0.5", "21.34.1")
            ))
        }
    });
    let result = resolve_zulu("21", &options(&server, &[LINUX_X64, WIN_X64, MAC_AARCH64])).unwrap();

    assert_eq!(result.label, "Zulu 21.34.1 (JDK 21.0.5)");
    assert_eq!(result.binaries.len(), 3);
    assert_eq!(
        result
            .binaries
            .iter()
            .find(|b| b.platform == MAC_AARCH64)
            .map(|b| b.filename.as_str()),
        Some("mac-old.tar.gz")
    );
}

// ── errors ────────────────────────────────────────────────────────────────

#[test]
fn reports_a_version_no_platform_carries() {
    let server = TestServer::start(|_: &Request| Reply::json("[]"));
    let err = resolve_zulu("99", &options(&server, &[LINUX_X64])).unwrap_err();
    assert_eq!(
        err.to_string(),
        "No Zulu binaries found for version '99' across requested platforms."
    );
}

#[test]
fn names_the_failing_platform_on_a_non_404_status() {
    let server = TestServer::start(|_: &Request| Reply::status(500));
    let err = resolve_zulu("21", &options(&server, &[MAC_AARCH64])).unwrap_err();
    assert_eq!(err.to_string(), "Azul API 500 for macos/aarch64");
}
