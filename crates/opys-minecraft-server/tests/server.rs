//! A server core, asked its three questions against a loopback server, so
//! the URLs it builds are the ones under test; and what it resolves to,
//! turned into a contribution.

mod common;

use common::{Reply, Request, TestServer};
use opys_minecraft_server::{
    build_server, list_builds, list_versions, resolve_server, Apis, Core, JarSource, ServerCore,
    ServerError, ServerOptions, EULA_FEATURE, STARTER_SHA256, STARTER_URL,
};
use serde_json::{json, Value};

fn options(raw: Value) -> ServerOptions {
    serde_json::from_value(raw).expect("options that decode")
}

fn refusal(raw: Value) -> String {
    serde_json::from_value::<ServerOptions>(raw)
        .unwrap_err()
        .to_string()
}

/// Every core, asked of `server`.
fn apis(server: &TestServer) -> Apis {
    serde_json::from_value(json!({
        "mojang": format!("{}/manifest.json", server.base),
        "paper": server.base, "purpur": server.base, "fabric": server.base,
        "forge": server.base, "forgeMaven": server.base, "neoforge": server.base,
    }))
    .unwrap()
}

fn against(server: &TestServer, raw: Value) -> ServerOptions {
    ServerOptions {
        apis: apis(server),
        ..options(raw)
    }
}

fn base_of(request: &Request) -> String {
    format!("http://{}", request.header("host").expect("a host header"))
}

/// The files of a resolved server, as a manifest would spell them.
fn files(raw: Value, server: &TestServer) -> Value {
    serde_json::to_value(resolve_server(&against(server, raw)).unwrap().files).unwrap()
}

fn pinned(raw: Value, server: &TestServer) -> Value {
    serde_json::to_value(resolve_server(&against(server, raw)).unwrap().pinned).unwrap()
}

fn sha256(bytes: &str) -> String {
    opys_dev::pin::sha256_hex(bytes.as_bytes())
}

fn starter() -> Value {
    json!({
        "path": "${root}/server.jar",
        "source": { "url": STARTER_URL },
        "size": 25_891,
        "integrity": { "sha256": STARTER_SHA256 },
    })
}

// ── options ───────────────────────────────────────────────────────────────

#[test]
fn a_core_is_named_by_the_field_that_holds_its_version() {
    let core = |raw: Value| options(raw).core;
    let text = |s: &str| s.to_owned();

    assert_eq!(core(json!({})), ServerCore::Vanilla { version: None });
    assert_eq!(
        core(json!({ "vanilla": "1.21.1" })),
        ServerCore::Vanilla {
            version: Some(text("1.21.1"))
        }
    );
    // A build is text, and a number is taken for one.
    for build in [json!(133), json!("133")] {
        assert_eq!(
            core(json!({ "paper": "1.21.1", "build": build })),
            ServerCore::Paper {
                version: text("1.21.1"),
                build: Some(text("133"))
            }
        );
    }
    assert_eq!(
        core(json!({ "purpur": "1.21.1" })),
        ServerCore::Purpur {
            version: text("1.21.1"),
            build: None
        }
    );
    assert_eq!(
        core(json!({ "fabric": "1.21.1", "loader": "0.19.5" })),
        ServerCore::Fabric {
            version: text("1.21.1"),
            loader: Some(text("0.19.5"))
        }
    );
    assert_eq!(
        core(json!({ "forge": "1.21.1", "build": "52.1.16" })),
        ServerCore::Forge {
            version: text("1.21.1"),
            build: Some(text("52.1.16"))
        }
    );
    assert_eq!(
        core(json!({ "neoforge": "21.1.259" })),
        ServerCore::Neoforge {
            version: text("21.1.259")
        }
    );
    assert_eq!(
        core(json!({ "jar": "https://x/purpur.jar" })),
        ServerCore::Jar(JarSource::Link(text("https://x/purpur.jar")))
    );
    assert_eq!(
        core(json!({ "installer": "build/fork-installer.jar" })),
        ServerCore::Installer(JarSource::File("build/fork-installer.jar".into()))
    );
}

#[test]
fn a_server_is_one_core_and_takes_only_that_cores_fields() {
    assert!(refusal(json!({ "paper": "1.21.1", "fabric": "1.21.1" }))
        .contains("server({ paper, fabric }) names two servers"));
    assert!(refusal(json!({ "vanilla": "1.21.1", "build": 5 }))
        .contains("server({ build }) means nothing for vanilla"));
    assert!(refusal(json!({ "build": 5 })).contains("means nothing for vanilla"));
    assert!(refusal(json!({ "paper": "1.21.1", "loader": "0.19.5" }))
        .contains("server({ loader }) means nothing for Paper"));
    assert!(refusal(json!({ "fabric": "1.21.1", "build": 1 }))
        .contains("server({ build }) means nothing for Fabric"));
    assert!(refusal(json!({ "neoforge": "21.1.259", "build": 1 }))
        .contains("means nothing for NeoForge, whose version is its build"));
    assert!(refusal(json!({ "jar": "a.jar", "build": 1 }))
        .contains("means nothing for a jar of your own"));
    // What used to be written, and what was never an option.
    assert!(refusal(json!({ "core": "paper" })).contains("unknown field `core`"));
    assert!(refusal(json!({ "eula": true })).contains("unknown field `eula`"));
}

#[test]
fn a_core_is_written_back_as_the_options_it_was_read_from() {
    for raw in [
        json!({ "vanilla": "1.21.1" }),
        json!({ "paper": "1.21.1", "build": "133" }),
        json!({ "purpur": "1.21.1" }),
        json!({ "fabric": "1.21.1", "loader": "0.19.5" }),
        json!({ "forge": "1.21.1", "build": "52.1.16" }),
        json!({ "neoforge": "21.1.259" }),
        json!({ "jar": "https://x/a.jar" }),
        json!({ "installer": "fork-installer.jar" }),
    ] {
        let written = serde_json::to_value(options(raw.clone()).core).unwrap();
        assert_eq!(written, raw);
    }
}

// ── vanilla ───────────────────────────────────────────────────────────────

fn version_json(id: &str, downloads: Value) -> String {
    json!({
        "id": id, "type": "release",
        "time": "2024-08-08T00:00:00+00:00", "releaseTime": "2024-08-08T00:00:00+00:00",
        "minimumLauncherVersion": 21, "assets": "17", "complianceLevel": 1,
        "mainClass": "net.minecraft.client.main.Main",
        "assetIndex": { "id": "17", "sha1": "c".repeat(40), "size": 1, "totalSize": 2, "url": "https://x/17.json" },
        "downloads": downloads,
        "libraries": [],
        "arguments": { "game": [], "jvm": [] },
    })
    .to_string()
}

/// Mojang, with a version that has a server, a snapshot, and an old
/// version that has none.
fn mojang() -> TestServer {
    TestServer::start(|request| {
        let base = base_of(request);
        let entry = |id: &str, kind: &str| {
            json!({
                "id": id, "type": kind, "url": format!("{base}/versions/{id}.json"),
                "time": "2024-08-08T00:00:00+00:00", "releaseTime": "2024-08-08T00:00:00+00:00",
                "sha1": "a".repeat(40), "complianceLevel": 1,
            })
        };
        let client = json!({ "sha1": "d".repeat(40), "size": 3, "url": "https://x/client.jar" });
        match request.target.as_str() {
            "/manifest.json" => Reply::json(
                json!({
                    "latest": { "release": "1.21.1", "snapshot": "24w33a" },
                    "versions": [
                        entry("24w33a", "snapshot"), entry("1.21.1", "release"), entry("1.0", "release"),
                    ],
                })
                .to_string(),
            ),
            "/versions/1.21.1.json" => Reply::json(version_json(
                "1.21.1",
                json!({
                    "client": client,
                    "server": { "sha1": "e".repeat(40), "size": 51_627_615, "url": "https://x/server.jar" },
                }),
            )),
            "/versions/1.0.json" => Reply::json(version_json("1.0", json!({ "client": client }))),
            _ => Reply::status(404),
        }
    })
}

#[test]
fn vanilla_is_the_jar_the_version_names_with_the_hash_mojang_gives() {
    let server = mojang();
    assert_eq!(
        files(json!({ "vanilla": "1.21.1" }), &server),
        json!([{
            "path": "${root}/server.jar",
            "source": { "url": "https://x/server.jar" },
            "size": 51_627_615,
            "integrity": { "sha1": "e".repeat(40) },
        }])
    );
    // No version is the current release, and resolving says which that was.
    assert_eq!(pinned(json!({}), &server), json!({ "vanilla": "1.21.1" }));
}

#[test]
fn vanilla_lists_releases_and_has_no_builds() {
    let server = mojang();
    assert_eq!(
        list_versions(Core::Vanilla, &apis(&server)).unwrap(),
        ["1.21.1", "1.0"]
    );
    assert!(list_builds(Core::Vanilla, "1.21.1", &apis(&server))
        .unwrap()
        .is_empty());
    assert!(server.targets().len() == 1, "builds ask nothing");
}

#[test]
fn a_version_mojang_published_no_server_for_says_so() {
    let server = mojang();
    let err = resolve_server(&against(&server, json!({ "vanilla": "1.0" }))).unwrap_err();
    assert_eq!(
        err.to_string(),
        "Minecraft 1.0 has no server: Mojang publishes none for it"
    );
}

// ── Paper ─────────────────────────────────────────────────────────────────

fn paper_api() -> TestServer {
    TestServer::start(|request| {
        let build = |id: u32, channel: &str| {
            json!({
                "id": id, "channel": channel,
                "downloads": { "server:default": {
                    "name": format!("paper-1.21.1-{id}.jar"),
                    "checksums": { "sha256": "f".repeat(64) },
                    "size": 49_394_394,
                    "url": format!("https://x/paper-1.21.1-{id}.jar"),
                } },
            })
        };
        match request.target.as_str() {
            // Written out, since the order of the groups is Paper's and is kept.
            "/v3/projects/paper" => Reply::json(
                r#"{ "versions": {
                    "26.1": ["26.1.2", "26.1.2-rc-1"],
                    "1.21": ["1.21.11", "1.21.11-pre3", "1.21.1"],
                    "1.9": ["1.9.4"]
                } }"#,
            ),
            "/v3/projects/paper/versions/1.21.1/builds" => Reply::json(
                json!([
                    build(134, "BETA"),
                    build(133, "STABLE"),
                    build(120, "STABLE")
                ])
                .to_string(),
            ),
            // A version with nothing stable yet, and one build with no server in it.
            "/v3/projects/paper/versions/26.1.2/builds" => Reply::json(
                json!([build(2, "ALPHA"), { "id": 1, "channel": "ALPHA", "downloads": {} }])
                    .to_string(),
            ),
            _ => Reply::status(404),
        }
    })
}

#[test]
fn paper_lists_stable_versions_in_papers_order_and_stable_builds() {
    let server = paper_api();
    assert_eq!(
        list_versions(Core::Paper, &apis(&server)).unwrap(),
        ["26.1.2", "1.21.11", "1.21.1", "1.9.4"]
    );
    assert_eq!(
        list_builds(Core::Paper, "1.21.1", &apis(&server)).unwrap(),
        ["133", "120"]
    );
    // Where nothing is stable yet, what there is.
    assert_eq!(
        list_builds(Core::Paper, "26.1.2", &apis(&server)).unwrap(),
        ["2", "1"]
    );
}

#[test]
fn paper_is_its_newest_stable_build_or_the_one_asked_for_with_papers_own_hash() {
    let server = paper_api();
    assert_eq!(
        files(json!({ "paper": "1.21.1" }), &server),
        json!([{
            "path": "${root}/server.jar",
            "source": { "url": "https://x/paper-1.21.1-133.jar" },
            "size": 49_394_394,
            "integrity": { "sha256": "f".repeat(64) },
        }])
    );
    assert_eq!(
        pinned(json!({ "paper": "1.21.1" }), &server),
        json!({ "paper": "1.21.1", "build": "133" })
    );
    // A build that is not stable is still there for whoever names it.
    assert_eq!(
        pinned(json!({ "paper": "1.21.1", "build": 134 }), &server),
        json!({ "paper": "1.21.1", "build": "134" })
    );

    let refused = |raw: Value| {
        resolve_server(&against(&server, raw))
            .unwrap_err()
            .to_string()
    };
    assert_eq!(
        refused(json!({ "paper": "1.21.1", "build": 999 })),
        "Paper has no server for 1.21.1, build 999"
    );
    assert_eq!(
        refused(json!({ "paper": "26.1.2", "build": 1 })),
        "Paper has no server for 26.1.2, build 1"
    );
    assert_eq!(
        refused(json!({ "paper": "9.9" })),
        "Paper has no server for 9.9"
    );
}

// ── Purpur ────────────────────────────────────────────────────────────────

fn purpur_api() -> TestServer {
    TestServer::start(|request| match request.target.as_str() {
        "/v2/purpur" => {
            Reply::json(json!({ "versions": ["1.20.6", "1.21.1", "26.3-rc1"] }).to_string())
        }
        "/v2/purpur/1.21.1" => Reply::json(
            json!({ "builds": { "latest": "2329", "all": ["2285", "2329"] } }).to_string(),
        ),
        "/v2/purpur/1.21.1/latest" | "/v2/purpur/1.21.1/2329" => {
            Reply::json(json!({ "build": "2329", "md5": "d".repeat(32) }).to_string())
        }
        "/v2/purpur/1.21.1/2285" => {
            Reply::json(json!({ "build": "2285", "md5": "c".repeat(32) }).to_string())
        }
        _ => Reply::status(404),
    })
}

#[test]
fn purpur_lists_newest_first_and_pins_by_the_one_hash_it_publishes() {
    let server = purpur_api();
    assert_eq!(
        list_versions(Core::Purpur, &apis(&server)).unwrap(),
        ["1.21.1", "1.20.6"]
    );
    assert_eq!(
        list_builds(Core::Purpur, "1.21.1", &apis(&server)).unwrap(),
        ["2329", "2285"]
    );
    assert_eq!(
        files(json!({ "purpur": "1.21.1" }), &server),
        json!([{
            "path": "${root}/server.jar",
            "source": { "url": format!("{}/v2/purpur/1.21.1/2329/download", server.base) },
            "integrity": { "md5": "d".repeat(32) },
        }])
    );
    assert_eq!(
        pinned(json!({ "purpur": "1.21.1", "build": 2285 }), &server),
        json!({ "purpur": "1.21.1", "build": "2285" })
    );
    let err = resolve_server(&against(&server, json!({ "purpur": "1.0" }))).unwrap_err();
    assert_eq!(err.to_string(), "Purpur has no server for 1.0");
    assert!(list_builds(Core::Purpur, "1.0", &apis(&server)).is_err());
}

// ── Fabric ────────────────────────────────────────────────────────────────

const FABRIC_JAR: &str = "the launcher jar";

fn fabric_meta() -> TestServer {
    TestServer::start(|request| {
        match request.target.as_str() {
        "/v2/versions/game" => Reply::json(
            json!([
                { "version": "26.4-snapshot-3", "stable": false },
                { "version": "1.21.1", "stable": true },
                { "version": "1.21", "stable": true },
            ])
            .to_string(),
        ),
        "/v2/versions/loader/1.21.1" => Reply::json(
            json!([
                { "loader": { "version": "0.20.0-beta.1", "stable": false } },
                { "loader": { "version": "0.19.5", "stable": true } },
                { "loader": { "version": "0.19.4", "stable": true } },
            ])
            .to_string(),
        ),
        "/v2/versions/loader/1.0" => Reply::json("[]"),
        "/v2/versions/installer" => Reply::json(
            json!([{ "version": "1.1.3", "stable": false }, { "version": "1.1.2", "stable": true }])
                .to_string(),
        ),
        "/v2/versions/loader/1.21.1/0.19.5/1.1.2/server/jar"
        | "/v2/versions/loader/1.21.1/0.18.0/1.1.2/server/jar" => Reply::json(FABRIC_JAR),
        _ => Reply::status(404),
    }
    })
}

#[test]
fn fabric_lists_stable_games_and_every_loader() {
    let server = fabric_meta();
    assert_eq!(
        list_versions(Core::Fabric, &apis(&server)).unwrap(),
        ["1.21.1", "1.21"]
    );
    assert_eq!(
        list_builds(Core::Fabric, "1.21.1", &apis(&server)).unwrap(),
        ["0.20.0-beta.1", "0.19.5", "0.19.4"]
    );
}

#[test]
fn fabric_takes_the_newest_stable_loader_and_pins_the_jar_by_reading_it() {
    let server = fabric_meta();
    let url = format!(
        "{}/v2/versions/loader/1.21.1/0.19.5/1.1.2/server/jar",
        server.base
    );
    assert_eq!(
        files(json!({ "fabric": "1.21.1" }), &server),
        json!([{
            "path": "${root}/server.jar",
            "source": { "url": url },
            "size": FABRIC_JAR.len(),
            "integrity": { "sha256": sha256(FABRIC_JAR) },
        }])
    );
    assert_eq!(
        pinned(json!({ "fabric": "1.21.1", "loader": "0.18.0" }), &server),
        json!({ "fabric": "1.21.1", "loader": "0.18.0" })
    );

    let refused = |raw: Value| {
        resolve_server(&against(&server, raw))
            .unwrap_err()
            .to_string()
    };
    assert_eq!(
        refused(json!({ "fabric": "1.0" })),
        "Fabric has no server for 1.0"
    );
    assert_eq!(
        refused(json!({ "fabric": "1.21.1", "loader": "9.9.9" })),
        "Fabric has no server for 1.21.1, build 9.9.9"
    );
}

// ── Forge and NeoForge ────────────────────────────────────────────────────

const INSTALLER: &str = "an installer";

fn forges() -> TestServer {
    TestServer::start(|request| match request.target.as_str() {
        "/net/minecraftforge/forge/maven-metadata.json" => Reply::json(
            json!({
                "1.20.1": ["1.20.1-47.4.0", "1.20.1-47.4.10"],
                "1.21.1": ["1.21.1-52.0.0", "1.21.1-52.1.0", "1.21.1-52.1.16"],
                "1.21.4": ["1.21.4-54.0.1"],
            })
            .to_string(),
        ),
        "/net/minecraftforge/forge/promotions_slim.json" => Reply::json(
            json!({ "promos": {
                "1.21.1-latest": "52.1.16", "1.21.1-recommended": "52.1.0",
                "1.21.4-latest": "54.0.1",
            } })
            .to_string(),
        ),
        "/net/minecraftforge/forge/1.21.1-52.1.0/forge-1.21.1-52.1.0-installer.jar"
        | "/net/minecraftforge/forge/1.21.4-54.0.1/forge-1.21.4-54.0.1-installer.jar"
        | "/releases/net/neoforged/neoforge/21.1.259/neoforge-21.1.259-installer.jar"
        | "/fork-installer.jar" => Reply::json(INSTALLER),
        "/api/maven/versions/releases/net/neoforged/neoforge" => Reply::json(
            json!({ "versions": ["20.2.86", "21.1.259", "26.3.0.69-beta"] }).to_string(),
        ),
        _ => Reply::status(404),
    })
}

fn installer(url: String) -> Value {
    json!({
        "path": "${root}/installer.jar",
        "source": { "url": url },
        "size": INSTALLER.len(),
        "integrity": { "sha256": sha256(INSTALLER) },
    })
}

#[test]
fn forge_lists_minecraft_versions_and_its_builds_of_one() {
    let server = forges();
    assert_eq!(
        list_versions(Core::Forge, &apis(&server)).unwrap(),
        ["1.21.4", "1.21.1", "1.20.1"]
    );
    assert_eq!(
        list_builds(Core::Forge, "1.21.1", &apis(&server)).unwrap(),
        ["52.1.16", "52.1.0", "52.0.0"]
    );
    assert!(list_builds(Core::Forge, "1.0", &apis(&server)).is_err());
}

#[test]
fn forge_is_the_starter_and_the_installer_of_the_build_forge_recommends() {
    let server = forges();
    let url = format!(
        "{}/net/minecraftforge/forge/1.21.1-52.1.0/forge-1.21.1-52.1.0-installer.jar",
        server.base
    );
    assert_eq!(
        files(json!({ "forge": "1.21.1" }), &server),
        json!([starter(), installer(url)])
    );
    assert_eq!(
        pinned(json!({ "forge": "1.21.1" }), &server),
        json!({ "forge": "1.21.1", "build": "52.1.0" })
    );
    // Where Forge recommends none, its newest.
    assert_eq!(
        pinned(json!({ "forge": "1.21.4" }), &server),
        json!({ "forge": "1.21.4", "build": "54.0.1" })
    );

    let refused = |raw: Value| {
        resolve_server(&against(&server, raw))
            .unwrap_err()
            .to_string()
    };
    assert_eq!(
        refused(json!({ "forge": "1.19.2" })),
        "Forge has no server for 1.19.2"
    );
    assert_eq!(
        refused(json!({ "forge": "1.21.1", "build": "1.2.3" })),
        "Forge has no server for 1.21.1, build 1.2.3"
    );
}

#[test]
fn a_forge_from_before_its_run_scripts_is_refused_before_anything_is_asked() {
    let server = forges();
    let err = resolve_server(&against(&server, json!({ "forge": "1.12.2" }))).unwrap_err();
    assert!(matches!(&err, ServerError::ForgeTooOld(version) if version == "1.12.2"));
    assert!(err.to_string().contains("since 1.17"));
    assert!(server.targets().is_empty());
}

#[test]
fn neoforge_is_named_by_its_own_version_alone() {
    let server = forges();
    assert_eq!(
        list_versions(Core::Neoforge, &apis(&server)).unwrap(),
        ["21.1.259", "20.2.86"]
    );
    assert!(list_builds(Core::Neoforge, "21.1.259", &apis(&server))
        .unwrap()
        .is_empty());

    let url = format!(
        "{}/releases/net/neoforged/neoforge/21.1.259/neoforge-21.1.259-installer.jar",
        server.base
    );
    assert_eq!(
        files(json!({ "neoforge": "21.1.259" }), &server),
        json!([starter(), installer(url)])
    );
    let err = resolve_server(&against(&server, json!({ "neoforge": "9.9.9" }))).unwrap_err();
    assert_eq!(err.to_string(), "NeoForge has no server for 9.9.9");
}

// ── a jar or an installer of the author's own ─────────────────────────────

#[test]
fn a_linked_jar_is_read_once_to_be_pinned_and_one_on_disk_is_left_there() {
    let server = TestServer::start(|request| match request.target.as_str() {
        "/pufferfish.jar" => Reply::json("a jar"),
        _ => Reply::status(404),
    });
    let url = format!("{}/pufferfish.jar", server.base);
    assert_eq!(
        files(json!({ "jar": url }), &server),
        json!([{
            "path": "${root}/server.jar",
            "source": { "url": url },
            "size": 5,
            "integrity": { "sha256": sha256("a jar") },
        }])
    );
    let gone = format!("{}/gone.jar", server.base);
    assert!(matches!(
        resolve_server(&options(json!({ "jar": gone }))),
        Err(ServerError::Pin(_))
    ));

    // A path is not opened here: the merge reads it, and names it then.
    assert_eq!(
        files(json!({ "jar": "build/spigot.jar" }), &server),
        json!([{ "path": "${root}/server.jar", "source": { "file": "build/spigot.jar" } }])
    );
}

#[test]
fn an_installer_of_a_fork_is_run_by_the_starter_as_neoforges_is() {
    let server = forges();
    let url = format!("{}/fork-installer.jar", server.base);
    assert_eq!(
        files(json!({ "installer": url }), &server),
        json!([starter(), installer(url.clone())])
    );
    assert_eq!(
        pinned(json!({ "installer": url }), &server),
        json!({ "installer": url })
    );
}

// ── the contribution ──────────────────────────────────────────────────────

#[test]
fn a_server_is_its_files_an_eula_behind_its_feature_and_a_launch_line() {
    let server = mojang();
    let build = build_server(&against(&server, json!({ "vanilla": "1.21.1" }))).unwrap();
    assert_eq!(build.output.name, "server");
    assert_eq!(build.label, "Minecraft 1.21.1");
    assert_eq!(
        serde_json::to_value(&build.pinned).unwrap(),
        json!({ "vanilla": "1.21.1" })
    );

    let contribution = serde_json::to_value(&build.output.contribution).unwrap();
    let artifacts = contribution["artifacts"].as_array().unwrap();
    assert_eq!(artifacts.len(), 2);
    assert_eq!(artifacts[0]["path"], "${root}/server.jar");
    assert_eq!(
        artifacts[1],
        json!({
            "path": "${root}/eula.txt",
            // `eula=true`, and a newline.
            "source": { "bytes": "ZXVsYT10cnVlCg==" },
            "rules": format!("allow.features.{EULA_FEATURE}"),
        })
    );
    assert_eq!(contribution["vars"], json!({ "root": "." }));
    assert_eq!(
        contribution["launch"],
        json!({
            "command": "${java_bin}",
            "jar": { "rules": [], "value": ["-jar", "${root}/server.jar"] },
            "args": "nogui",
        })
    );
}

#[test]
fn a_server_an_installer_makes_is_started_so_that_a_newer_installer_is_run() {
    let server = forges();
    let build = build_server(&against(&server, json!({ "neoforge": "21.1.259" }))).unwrap();
    let contribution = serde_json::to_value(&build.output.contribution).unwrap();
    assert_eq!(contribution["artifacts"].as_array().unwrap().len(), 3);
    assert_eq!(
        contribution["launch"]["jar"]["value"],
        json!(["-jar", "${root}/server.jar", "--installer-force"])
    );
}

#[test]
fn a_jar_from_disk_is_carried_and_named_by_what_it_holds() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("spigot.jar");
    std::fs::write(&path, b"a jar").unwrap();
    let build = build_server(&options(json!({ "jar": path }))).unwrap();

    let jar = build.output.contribution.artifacts[0].clone();
    let (artifact, blob) = jar.resolve().unwrap();
    assert_eq!(
        serde_json::to_value(&artifact).unwrap()["source"],
        json!({ "blob": sha256("a jar") })
    );
    assert_eq!(blob.unwrap().0, sha256("a jar"));
}
