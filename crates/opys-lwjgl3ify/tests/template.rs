//! Resolving a release end to end: index → document → assets → the mod jars.
//!
//! The version half is the Cleanroom path and is covered there in spirit; what
//! is this crate's own is the second half — which release each mod jar is
//! taken from, which asset out of it, and that turning UniMixins off or
//! pinning it does what it says.

mod common;

use common::{Reply, TestServer};
use opys_core::Val;
use opys_lwjgl3ify::{resolve_lwjgl3ify, Lwjgl3ifyOptions, Unimixins, UnimixinsOptions};
use serde_json::json;

const RFB: &str = "com.gtnewhorizons.retrofuturabootstrap.MainStartOnFirstThread";
const TAG: &str = "3.0.37";

fn library(name: &str, path: &str) -> serde_json::Value {
    json!({
        "name": name,
        "downloads": { "artifact": { "path": path, "url": "https://maven/x.jar", "sha1": "a".repeat(40), "size": 1000 } },
    })
}

fn document(assets_url: &str) -> serde_json::Value {
    json!({
        "id": format!("1.7.10-Forge10.13.4.1614-1.7.10-lwjgl3ify-{TAG}"),
        "type": "release",
        "time": "2026-10-04T12:05:03+03:00",
        "releaseTime": "2026-10-04T12:05:03+03:00",
        "minimumLauncherVersion": 21,
        "complianceLevel": 0,
        "javaVersion": { "component": "java-runtime-epsilon", "majorVersion": 25 },
        "mainClass": RFB,
        "assets": "1.7.10",
        "assetIndex": {
            "id": "1.7.10", "sha1": "e".repeat(40), "size": 400, "totalSize": 5000, "url": assets_url,
        },
        "downloads": {
            "client": { "sha1": "f".repeat(40), "size": 5_000_000, "url": "https://launcher.mojang/client.jar" },
        },
        "arguments": {
            "game": ["--username", "${auth_player_name}", "--tweakClass", "cpw.mods.fml.common.launcher.FMLTweaker"],
            "jvm": ["-Djava.library.path=${natives_directory}", "--add-opens", "java.base/java.lang=ALL-UNNAMED", "-cp", "${classpath}"],
        },
        "libraries": [
            library(
                &format!("com.github.GTNewHorizons:lwjgl3ify:{TAG}:forgePatches"),
                &format!("com/github/GTNewHorizons/lwjgl3ify/{TAG}/lwjgl3ify-{TAG}-forgePatches.jar"),
            ),
            library("org.lwjgl:lwjgl:3.3.3", "org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3.jar"),
        ],
    })
}

fn asset(name: &str, digest: Option<&str>) -> serde_json::Value {
    let mut asset = json!({
        "name": name,
        "size": 4242,
        "browser_download_url": format!("https://github.test/download/{name}"),
    });
    if let Some(digest) = digest {
        asset["digest"] = json!(format!("sha256:{digest}"));
    }
    asset
}

fn release(tag: &str, prerelease: bool, assets: Vec<serde_json::Value>) -> serde_json::Value {
    json!({ "tag_name": tag, "prerelease": prerelease, "draft": false, "published_at": "2026-10-04T00:00:00Z", "assets": assets })
}

fn unimixins(tag: &str, prerelease: bool) -> serde_json::Value {
    release(
        tag,
        prerelease,
        vec![
            asset(&format!("+unimixins-all-1.7.10-{tag}-dev.jar"), None),
            asset(
                &format!("+unimixins-all-1.7.10-{tag}.jar"),
                Some(&"d".repeat(64)),
            ),
            asset(&format!("+unimixins-mixin-1.7.10-{tag}.jar"), None),
        ],
    )
}

/// One loopback server standing in for the document site and for GitHub.
fn site() -> TestServer {
    TestServer::start(move |request| {
        let base = format!("http://{}", request.header("host").unwrap_or_default());
        let target = request.target.as_str();
        let url = format!("{base}/versions/1.7.10/{TAG}.json");

        let body = if target == "/index.json" {
            json!({ "versions": { "1.7.10": {
                "latest": TAG, "latestUrl": url,
                "recommended": TAG, "recommendedUrl": url,
                "best": TAG, "bestUrl": url,
                "builds": [{ "build": TAG, "url": url }],
            }}})
        } else if target.starts_with("/versions/") {
            document(&format!("{base}/assets/1.7.10.json"))
        } else if target.starts_with("/assets/") {
            json!({ "objects": { "minecraft/sounds/click.ogg": { "hash": "ab".repeat(20), "size": 100 } } })
        } else if target == format!("/repos/GTNewHorizons/lwjgl3ify/releases/tags/{TAG}") {
            release(
                TAG,
                false,
                vec![
                    asset(&format!("lwjgl3ify-{TAG}-dev.jar"), None),
                    asset(&format!("lwjgl3ify-{TAG}-forgePatches.jar"), None),
                    asset(&format!("lwjgl3ify-{TAG}.jar"), Some(&"c".repeat(64))),
                    asset("version.json", None),
                ],
            )
        } else if target == "/repos/fork/lwjgl3ify/releases/tags/3.0.37" {
            release(TAG, false, vec![asset("version.json", None)])
        } else if target.starts_with("/repos/LegacyModdingMC/UniMixins/releases?") {
            json!([
                unimixins("0.3.0-rc", true),
                unimixins("0.2.1", false),
                unimixins("0.2.0", false)
            ])
        } else if target == "/repos/LegacyModdingMC/UniMixins/releases/tags/0.1.5" {
            unimixins("0.1.5", false)
        } else {
            return Reply::status(404);
        };
        Reply::json(body.to_string())
    })
}

fn options(server: &TestServer, version: &str) -> Lwjgl3ifyOptions {
    Lwjgl3ifyOptions {
        version: version.to_owned(),
        source: Some(server.base.clone()),
        api_base: Some(server.base.clone()),
        ..Default::default()
    }
}

fn values(val: &Val) -> Vec<String> {
    val.value.clone()
}

fn mods(artifacts: &[opys_core::Artifact]) -> Vec<String> {
    artifacts
        .iter()
        .filter(|a| a.path.starts_with("${game_directory}/mods/"))
        .map(|a| {
            a.path
                .trim_start_matches("${game_directory}/mods/")
                .to_owned()
        })
        .collect()
}

#[test]
fn resolving_walks_the_site_then_asks_github_for_exactly_two_releases() {
    let server = site();
    resolve_lwjgl3ify(&options(&server, "1.7.10")).unwrap();

    assert_eq!(
        server.targets(),
        [
            "/index.json",
            &format!("/versions/1.7.10/{TAG}.json"),
            "/assets/1.7.10.json",
            // By tag: the index already said which release, and lwjgl3ify has
            // more releases than one page of the listing.
            &format!("/repos/GTNewHorizons/lwjgl3ify/releases/tags/{TAG}"),
            "/repos/LegacyModdingMC/UniMixins/releases?per_page=100",
        ]
    );
}

#[test]
fn the_documents_own_main_class_launches() {
    let server = site();
    let t = resolve_lwjgl3ify(&options(&server, TAG)).unwrap();

    assert_eq!(values(&t.main_class), [RFB]);
}

#[test]
fn the_plain_mod_jar_is_installed_not_one_of_its_siblings() {
    let server = site();
    let t = resolve_lwjgl3ify(&options(&server, TAG)).unwrap();

    let jar = t
        .artifacts
        .iter()
        .find(|a| a.path == format!("${{game_directory}}/mods/lwjgl3ify-{TAG}.jar"))
        .expect("the mod jar");
    let encoded = serde_json::to_string(jar).unwrap();
    assert!(
        encoded.contains(&format!("https://github.test/download/lwjgl3ify-{TAG}.jar")),
        "{encoded}"
    );
    assert!(encoded.contains(&"c".repeat(64)), "{encoded}");
    assert!(!mods(&t.artifacts)
        .iter()
        .any(|m| m.contains("-dev") || m.contains("forgePatches")));
}

#[test]
fn a_mod_jar_github_has_no_digest_for_is_hashed_rather_than_shipped_unverified() {
    // An old release: the listing carries no digest, so the jar is read.
    let server = TestServer::start(|request| {
        let base = format!("http://{}", request.header("host").unwrap_or_default());
        let target = request.target.as_str();
        let url = format!("{base}/versions/1.7.10/{TAG}.json");
        let body = if target == "/index.json" {
            json!({ "versions": { "1.7.10": { "builds": [{ "build": TAG, "url": url }] } } })
        } else if target.starts_with("/versions/") {
            document(&format!("{base}/assets/1.7.10.json"))
        } else if target.starts_with("/assets/") {
            json!({ "objects": {} })
        } else if target.starts_with("/repos/") {
            json!({
                "tag_name": TAG, "prerelease": false, "draft": false, "published_at": "2023-01-01T00:00:00Z",
                "assets": [{ "name": format!("lwjgl3ify-{TAG}.jar"), "size": 999, "browser_download_url": format!("{base}/jar") }],
            })
        } else if target == "/jar" {
            return Reply::json("hello");
        } else {
            return Reply::status(404);
        };
        Reply::json(body.to_string())
    });
    let mut o = options(&server, TAG);
    o.unimixins = Unimixins::Skip;
    let t = resolve_lwjgl3ify(&o).unwrap();

    let jar = serde_json::to_value(t.artifacts.last().unwrap()).unwrap();
    assert_eq!(
        jar["integrity"],
        json!({ "sha256": "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824" })
    );
    // The size that was read, not the 999 the listing claimed.
    assert_eq!(jar["size"], 5);
}

#[test]
fn unimixins_defaults_to_the_newest_stable_all_in_one_jar() {
    let server = site();
    let t = resolve_lwjgl3ify(&options(&server, TAG)).unwrap();

    assert_eq!(
        mods(&t.artifacts),
        [
            format!("lwjgl3ify-{TAG}.jar"),
            "+unimixins-all-1.7.10-0.2.1.jar".to_owned()
        ]
    );
}

#[test]
fn unimixins_can_take_a_prerelease_or_a_pinned_tag() {
    let server = site();
    let with = |version: &str| {
        let mut o = options(&server, TAG);
        o.unimixins = Unimixins::Install(UnimixinsOptions {
            version: Some(version.to_owned()),
            repo: None,
        });
        mods(&resolve_lwjgl3ify(&o).unwrap().artifacts)[1].clone()
    };

    assert_eq!(with("prerelease"), "+unimixins-all-1.7.10-0.3.0-rc.jar");
    assert_eq!(with("latest"), "+unimixins-all-1.7.10-0.2.1.jar");
    // Not on the listed page at all; found because it is asked for by tag.
    assert_eq!(with("0.1.5"), "+unimixins-all-1.7.10-0.1.5.jar");
}

#[test]
fn unimixins_can_be_left_out() {
    let server = site();
    let mut o = options(&server, TAG);
    o.unimixins = Unimixins::Skip;
    let t = resolve_lwjgl3ify(&o).unwrap();

    assert_eq!(mods(&t.artifacts), [format!("lwjgl3ify-{TAG}.jar")]);
    assert!(!server.targets().iter().any(|t| t.contains("UniMixins")));
}

#[test]
fn the_mod_jars_are_files_for_the_game_not_classpath_entries() {
    let server = site();
    let t = resolve_lwjgl3ify(&options(&server, TAG)).unwrap();

    for arm in &t.classpath {
        assert!(!arm.value.contains("/mods/"), "{}", arm.value);
    }
    assert!(t.classpath[0].value.contains("forgePatches"));
}

#[test]
fn a_release_without_the_mod_jar_is_named_in_the_error() {
    let server = site();
    let mut o = options(&server, TAG);
    o.repo = Some("fork/lwjgl3ify".to_owned());
    let message = resolve_lwjgl3ify(&o).unwrap_err().to_string();

    assert!(message.contains("fork/lwjgl3ify"), "{message}");
    assert!(message.contains(TAG), "{message}");
}

#[test]
fn unimixins_is_written_as_false_or_as_options() {
    let parse = |raw: serde_json::Value| {
        serde_json::from_value::<Lwjgl3ifyOptions>(raw)
            .unwrap()
            .unimixins
    };

    assert_eq!(parse(json!({ "version": TAG })), Unimixins::default());
    assert_eq!(
        parse(json!({ "version": TAG, "unimixins": false })),
        Unimixins::Skip
    );
    assert_eq!(
        parse(json!({ "version": TAG, "unimixins": true })),
        Unimixins::default()
    );
    assert_eq!(
        parse(json!({ "version": TAG, "unimixins": { "version": "0.1.5" } })),
        Unimixins::Install(UnimixinsOptions {
            version: Some("0.1.5".to_owned()),
            repo: None
        })
    );
    // And back: the options cross napi as JSON in both directions.
    assert_eq!(serde_json::to_value(Unimixins::Skip).unwrap(), json!(false));
}

#[test]
fn the_template_roundtrips_through_json() {
    let server = site();
    let t = resolve_lwjgl3ify(&options(&server, TAG)).unwrap();

    let encoded = serde_json::to_string(&t).unwrap();
    let decoded: opys_lwjgl3ify::Lwjgl3ifyTemplate = serde_json::from_str(&encoded).unwrap();
    assert_eq!(decoded, t);
}
