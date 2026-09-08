//! The vendor-agnostic half: a resolved release in, artifacts and vars out.
//! Pure, so most of this needs no server at all — only the vendor-dispatch
//! cases do.

mod common;

use common::{Reply, Request, TestServer};
use opys_core::{
    ExtractRule, HashEntry, Integrity, MojangRule, OsArch, OsConstraint, OsName, RuleAction,
    Source, ValDef,
};
use opys_java::{
    build_java, java_template, resolve_java, JavaOptions, JavaVendor, Platform, SupportedArch,
    VendorBinary, VendorRelease,
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

fn binary(platform: Platform, filename: &str) -> VendorBinary {
    VendorBinary {
        platform,
        filename: filename.to_owned(),
        url: format!("https://example.invalid/{filename}"),
        size: 100,
        sha256: Some("cafe".to_owned()),
        discovery: None,
    }
}

fn release(binaries: Vec<VendorBinary>) -> VendorRelease {
    VendorRelease {
        label: "Temurin 21.0.11+10".to_owned(),
        major: 21,
        binaries,
    }
}

fn arms(def: &ValDef) -> &[opys_core::ConditionalVal] {
    match def {
        ValDef::Arms(arms) => arms,
        ValDef::Flat(_) => panic!("expected conditional arms"),
    }
}

// ── artifacts ─────────────────────────────────────────────────────────────

#[test]
fn emits_one_artifact_per_resolved_binary() {
    let template = java_template(release(vec![
        binary(LINUX_X64, "linux.tar.gz"),
        binary(MAC_AARCH64, "mac.tar.gz"),
    ]));
    assert_eq!(template.artifacts.len(), 2);
}

#[test]
fn places_archives_under_the_runtime_dir_as_a_url_source() {
    let template = java_template(release(vec![binary(LINUX_X64, "linux.tar.gz")]));
    let artifact = &template.artifacts[0];
    assert_eq!(artifact.path, "${java_runtime_dir}/linux.tar.gz");
    assert_eq!(
        artifact.source,
        Source::Url {
            url: "https://example.invalid/linux.tar.gz".to_owned()
        }
    );
    assert_eq!(artifact.size, Some(100));
    assert_eq!(
        artifact.integrity,
        Some(Integrity::One(HashEntry::Sha256 {
            sha256: "cafe".to_owned()
        }))
    );
}

#[test]
fn scopes_each_artifact_with_an_os_and_arch_ruleset() {
    let template = java_template(release(vec![binary(MAC_AARCH64, "mac.tar.gz")]));
    assert_eq!(
        template.artifacts[0].rules,
        vec![
            MojangRule::Os {
                action: RuleAction::Allow,
                os: OsConstraint {
                    name: Some(OsName::Osx),
                    ..Default::default()
                }
            },
            MojangRule::Os {
                action: RuleAction::Allow,
                os: OsConstraint {
                    arch: Some(OsArch::Aarch64),
                    ..Default::default()
                }
            },
        ]
    );
}

#[test]
fn extracts_with_a_glob_strip_into_the_major_versioned_runtime_dir() {
    let template = java_template(release(vec![binary(LINUX_X64, "linux.tar.gz")]));
    let extract = template.artifacts[0]
        .extract
        .as_ref()
        .expect("an extract rule");
    let ExtractRule::Scan(scan) = &extract[0] else {
        panic!("expected a scan rule, got {:?}", extract[0]);
    };
    assert_eq!(scan.matches, "*");
    assert_eq!(scan.into, "${java_runtime_dir}/jdk-21");
    // The archive's own top-level directory embeds a build id no resolver can
    // predict, so it is stripped by shape rather than by name.
    assert_eq!(scan.strip.as_deref(), Some(["*/".to_owned()].as_slice()));
}

#[test]
fn carries_a_discovery_fallback_onto_the_artifact() {
    let mut b = binary(LINUX_X64, "linux.tar.gz");
    b.sha256 = None;
    b.discovery = Some(opys_core::Discovery {
        integrity: Some(opys_core::IntegrityProbes {
            header: None,
            url: Some(opys_core::HashRef::Sha256 {
                sha256: "${url}.sha256".to_owned(),
            }),
        }),
        size: None,
    });
    let template = java_template(release(vec![b]));
    let artifact = &template.artifacts[0];
    assert!(artifact.integrity.is_none());
    assert!(artifact.discovery.is_some());
}

// ── vars ──────────────────────────────────────────────────────────────────

#[test]
fn defines_the_runtime_dir_under_root() {
    let template = java_template(release(vec![binary(LINUX_X64, "linux.tar.gz")]));
    assert_eq!(
        template.vars["java_runtime_dir"],
        ValDef::Flat("${root}/runtimes".to_owned())
    );
}

#[test]
fn builds_a_suffix_free_java_home_on_linux() {
    let template = java_template(release(vec![binary(LINUX_X64, "linux.tar.gz")]));
    let home = arms(&template.vars["java_home"]);
    assert_eq!(home.len(), 1);
    assert_eq!(home[0].value, "${java_runtime_dir}/jdk-21");
}

#[test]
fn appends_contents_home_on_macos() {
    let template = java_template(release(vec![binary(MAC_AARCH64, "mac.tar.gz")]));
    let home = arms(&template.vars["java_home"]);
    assert_eq!(home[0].value, "${java_runtime_dir}/jdk-21/Contents/Home");
}

#[test]
fn points_java_bin_at_bin_java_off_windows() {
    let template = java_template(release(vec![binary(LINUX_X64, "linux.tar.gz")]));
    let bin = arms(&template.vars["java_bin"]);
    assert_eq!(bin.len(), 1);
    assert_eq!(bin[0].value, "${java_home}/bin/java");
}

#[test]
fn gates_the_windows_console_binary_behind_a_feature() {
    let template = java_template(release(vec![binary(WIN_X64, "win.zip")]));
    let bin = arms(&template.vars["java_bin"]);
    assert_eq!(bin.len(), 2);

    // Default arm: no console window.
    assert_eq!(bin[0].value, "${java_home}/bin/javaw.exe");
    assert_eq!(bin[0].rules[1].action(), RuleAction::Disallow);
    // Opt-in arm: a console to watch stdout/stderr.
    assert_eq!(bin[1].value, "${java_home}/bin/java.exe");
    assert_eq!(bin[1].rules[1].action(), RuleAction::Allow);

    // Exactly one arm is active for any feature state.
    let windows = opys_core::OsOptions {
        name: "windows".to_owned(),
        version: "10".to_owned(),
        arch: "x86_64".to_owned(),
    };
    for feats in [vec![], vec!["java_console".to_owned()]] {
        let active = bin
            .iter()
            .filter(|arm| opys_core::satisfies_ruleset(&arm.rules, &windows, &feats).unwrap())
            .count();
        assert_eq!(active, 1, "feats: {feats:?}");
    }
}

#[test]
fn emits_one_arm_per_distinct_os_not_per_arch() {
    let template = java_template(release(vec![
        binary(LINUX_X64, "linux-x64.tar.gz"),
        binary(
            Platform {
                os: OsName::Linux,
                arch: SupportedArch::Aarch64,
            },
            "linux-arm.tar.gz",
        ),
        binary(MAC_AARCH64, "mac.tar.gz"),
    ]));
    assert_eq!(template.artifacts.len(), 3);
    assert_eq!(arms(&template.vars["java_home"]).len(), 2);
    assert_eq!(arms(&template.vars["java_bin"]).len(), 2);
}

#[test]
fn passes_the_release_metadata_through() {
    let resolved = release(vec![binary(LINUX_X64, "linux.tar.gz")]);
    let template = java_template(resolved.clone());
    assert_eq!(template.release, resolved);
}

// ── vendor dispatch ───────────────────────────────────────────────────────

fn temurin_body() -> String {
    r#"[{"release_name":"jdk-21.0.11+10","version_data":{"major":21},"binaries":[
        {"architecture":"x64","os":"linux","image_type":"jdk","jvm_impl":"hotspot",
         "package":{"checksum":"abc","link":"https://x/a.tar.gz","name":"a.tar.gz","size":1}}]}]"#
        .to_owned()
}

fn zulu_body() -> String {
    r#"[{"name":"z.tar.gz","download_url":"https://x/z.tar.gz","size":2,
         "sha256_hash":"def","java_version":[21,0,5],"distro_version":[21,38,21]}]"#
        .to_owned()
}

fn graalvm_body() -> String {
    r#"[{"tag_name":"jdk-21.0.2","prerelease":false,"draft":false,"assets":[
        {"name":"g_linux-x64_bin.tar.gz","size":3,
         "browser_download_url":"https://x/g.tar.gz","digest":"sha256:ghi"}]}]"#
        .to_owned()
}

/// One server that answers whichever vendor's endpoint is asked for, so the
/// test asserts on the dispatch rather than on the fixture.
fn any_vendor() -> impl Fn(&Request) -> Reply {
    |req: &Request| {
        if req.target.starts_with("/assets/") {
            Reply::json(temurin_body())
        } else if req.target.starts_with("/zulu/packages/") {
            Reply::json(zulu_body())
        } else if req.target.starts_with("/repos/") {
            Reply::json(graalvm_body())
        } else {
            Reply::status(404)
        }
    }
}

fn options(server: &TestServer, vendor: Option<JavaVendor>) -> JavaOptions {
    JavaOptions {
        version: "21".to_owned(),
        vendor,
        platforms: Some(vec![LINUX_X64]),
        api_base: Some(server.base.clone()),
        token: None,
    }
}

#[test]
fn defaults_to_temurin_when_no_vendor_is_named() {
    let server = TestServer::start(any_vendor());
    let template = resolve_java(&options(&server, None)).unwrap();
    assert_eq!(template.release.label, "Temurin 21.0.11+10");
    assert!(server.targets()[0].starts_with("/assets/"));
}

#[test]
fn dispatches_zulu_to_the_azul_api() {
    let server = TestServer::start(any_vendor());
    let template = resolve_java(&options(&server, Some(JavaVendor::Zulu))).unwrap();
    assert_eq!(template.release.label, "Zulu 21.38.21 (JDK 21.0.5)");
    assert!(server.targets()[0].starts_with("/zulu/packages/"));
}

#[test]
fn dispatches_graalvm_to_the_github_releases_api() {
    let server = TestServer::start(any_vendor());
    let template = resolve_java(&options(&server, Some(JavaVendor::Graalvm))).unwrap();
    assert_eq!(template.release.label, "GraalVM CE 21.0.2");
    assert!(server.targets()[0].starts_with("/repos/"));
}

// ── the plugin's contribution ─────────────────────────────────────────────

#[test]
fn builds_a_contribution_owning_the_java_vars_and_the_bin_launch_group() {
    let server = TestServer::start(any_vendor());
    let build = build_java(&options(&server, None)).unwrap();

    assert_eq!(build.output.name, "java");
    assert_eq!(build.release.label, "Temurin 21.0.11+10");

    let contribution = &build.output.contribution;
    assert_eq!(contribution.artifacts.len(), 1);
    assert!(contribution.vars.contains_key("java_home"));
    assert!(contribution.vars.contains_key("java_bin"));
    assert_eq!(
        contribution.launch["bin"],
        opys_dev::LaunchFragment::Text("${java_bin}".to_owned())
    );
    assert_eq!(
        contribution.envs["JAVA_HOME"],
        ValDef::Flat("${java_home}".to_owned())
    );
}
