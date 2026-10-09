//! Libraries a config adds: how one is written, how it is pinned, and how it
//! is folded onto a version's own.

mod common;

use common::{Reply, TestServer};
use opys_bundle::{blob_id, BlobSource};
use opys_core::{Source, ValDef};
use opys_minecraft_vanilla::{
    add_libraries, client_to_template, resolve_libraries, with_libraries, ExtraLibrary,
    ExtraSource, MinecraftTemplate,
};
use opys_mojang::{AssetManifest, Client};
use serde_json::{json, Value};

fn library(raw: Value) -> ExtraLibrary {
    serde_json::from_value(raw).expect("a library")
}

fn refused(raw: Value) -> String {
    serde_json::from_value::<ExtraLibrary>(raw)
        .expect_err("refused")
        .to_string()
}

/// A version with gson and a natives bundle on its classpath.
fn template() -> MinecraftTemplate {
    let lib = |name: &str, path: &str| {
        json!({
            "name": name,
            "downloads": { "artifact": {
                "path": path, "sha1": "d".repeat(40), "size": 250,
                "url": format!("https://libraries.minecraft.net/{path}"),
            }},
        })
    };
    let client = Client::from_version_json(json!({
        "id": "1.20.1",
        "type": "release",
        "time": "2023-06-12T00:00:00+00:00",
        "releaseTime": "2023-06-12T00:00:00+00:00",
        "minimumLauncherVersion": 21,
        "assets": "5",
        "complianceLevel": 1,
        "mainClass": "net.minecraft.client.main.Main",
        "assetIndex": {
            "id": "5", "sha1": "a".repeat(40), "size": 100, "totalSize": 200,
            "url": "https://piston-meta.mojang.com/5.json",
        },
        "downloads": {
            "client": { "sha1": "b".repeat(40), "size": 1000, "url": "https://piston-data.mojang.com/client.jar" },
        },
        "libraries": [
            lib("com.google.code.gson:gson:2.10.1", "com/google/code/gson/gson/2.10.1/gson-2.10.1.jar"),
            lib("org.lwjgl:lwjgl:3.3.1", "org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1.jar"),
        ],
        "arguments": { "game": [], "jvm": [] },
    }))
    .expect("client");
    let assets: AssetManifest = serde_json::from_value(json!({ "objects": {} })).expect("assets");
    client_to_template(&client, &assets).expect("template")
}

/// The Linux arm of the classpath, as the list a JVM is handed.
fn classpath(t: &MinecraftTemplate) -> Vec<String> {
    let Some(ValDef::Arms(arms)) = t.vars.get("classpath") else {
        panic!("classpath is not per-OS");
    };
    arms.iter()
        .find(|arm| format!("{:?}", arm.rules).contains("Linux"))
        .expect("a linux arm")
        .value
        .split("${classpath_separator}")
        .map(str::to_owned)
        .collect()
}

const PATH: &str = "org/example/tool/1.2/tool-1.2.jar";
const INSTALLED: &str = "${library_directory}/org/example/tool/1.2/tool-1.2.jar";

/// A library whose artifact holds `fields` beside its path.
fn tool(fields: Value) -> Value {
    let mut artifact = json!({ "path": PATH });
    artifact
        .as_object_mut()
        .expect("an object")
        .extend(fields.as_object().expect("an object").clone());
    json!({ "name": "org.example:tool:1.2", "artifact": artifact })
}

fn pinned(url: &str) -> Value {
    tool(json!({ "source": { "url": url }, "size": 7, "integrity": { "sha1": "c".repeat(40) } }))
}

// ── how one is written ──────────────────────────────────────────────────

#[test]
fn a_library_is_a_name_and_a_manifest_artifact() {
    let lib = library(pinned("https://example.com/tool.jar"));
    assert_eq!(lib.name.to_string(), "org.example:tool:1.2");
    assert_eq!(lib.path, PATH);
    assert_eq!(
        lib.source,
        ExtraSource::Url("https://example.com/tool.jar".to_owned())
    );
    assert_eq!(lib.size, Some(7));
    assert!(format!("{:?}", lib.integrity).contains(&"c".repeat(40)));
}

#[test]
fn a_file_stands_where_the_url_would() {
    let lib = library(tool(json!({ "source": { "file": "/srv/libs/tool.jar" } })));
    assert_eq!(lib.source, ExtraSource::File("/srv/libs/tool.jar".into()));
}

#[test]
fn rules_and_extraction_are_read_as_a_manifest_reads_them() {
    let short = library(tool(json!({
        "source": { "url": "https://x/t.jar" },
        "rules": "allow.os.linux",
        "extract": { "into": "${natives_directory}" },
    })));
    let long = library(tool(json!({
        "source": { "url": "https://x/t.jar" },
        "rules": [{ "action": "allow", "os": { "name": "linux" } }],
    })));
    assert_eq!(short.rules, long.rules);
    assert_eq!(short.rules.len(), 1);
    assert_eq!(short.extract.as_ref().map(Vec::len), Some(1));
}

#[test]
fn an_artifact_without_what_it_needs_is_refused_by_the_librarys_name() {
    for (raw, says) in [
        (
            json!({ "name": "org.example:tool:1.2", "artifact": { "path": PATH } }),
            "missing field `source`",
        ),
        (tool(json!({ "source": {} })), "`{ url }` or `{ file }`"),
        (
            tool(json!({ "source": { "url": "https://x/t.jar", "file": "t.jar" } })),
            "`{ url }` or `{ file }`",
        ),
        (
            tool(json!({ "source": { "blob": "0".repeat(64) } })),
            "unknown field `blob`",
        ),
        (
            json!({ "name": "org.example:tool:1.2", "artifact": { "source": { "url": "https://x" } } }),
            "missing field `path`",
        ),
        (
            tool(json!({ "source": { "url": "https://x" }, "sha1": "c".repeat(40) })),
            "unknown field `sha1`",
        ),
    ] {
        let error = refused(raw);
        assert!(error.contains("library 'org.example:tool:1.2'"), "{error}");
        assert!(error.contains(says), "{error}");
    }
    assert!(refused(json!({ "name": "tool", "artifact": {} })).contains("not a Maven coordinate"));
}

#[test]
fn a_path_stays_inside_the_library_directory() {
    for path in [
        "/abs/tool.jar",
        "../tool.jar",
        "a/../../tool.jar",
        "${root}/tool.jar",
        "",
    ] {
        let error = refused(json!({
            "name": "org.example:tool:1.2",
            "artifact": { "path": path, "source": { "url": "https://x/t.jar" } },
        }));
        assert!(error.contains("stays inside it"), "{path}: {error}");
    }
}

#[test]
fn a_file_takes_no_integrity_of_its_own() {
    let error = refused(tool(json!({
        "source": { "file": "t.jar" },
        "integrity": { "sha1": "c".repeat(40) },
    })));
    assert!(error.contains("pinned by its own content"), "{error}");
}

#[test]
fn a_library_reads_back_what_it_wrote() {
    for raw in [
        pinned("https://example.com/tool.jar"),
        tool(
            json!({ "source": { "url": "https://x/t.jar" }, "rules": "allow.os.osx",
                     "extract": { "into": "${natives_directory}" } }),
        ),
        tool(json!({ "source": { "file": "/srv/tool.jar" } })),
    ] {
        let lib = library(raw);
        let again: ExtraLibrary =
            serde_json::from_value(serde_json::to_value(&lib).expect("written")).expect("read");
        assert_eq!(again, lib);
    }
}

// ── how one is pinned ───────────────────────────────────────────────────

#[test]
fn a_library_that_carries_its_integrity_is_not_downloaded() {
    // Nothing listens here: a request would fail the test.
    let resolved =
        resolve_libraries(&[library(pinned("http://127.0.0.1:1/tool.jar"))]).expect("resolved");
    let (artifact, entry) = &resolved.entries[0];
    assert_eq!(artifact.path, INSTALLED);
    assert_eq!(artifact.size, Some(7));
    assert!(format!("{:?}", artifact.integrity).contains(&"c".repeat(40)));
    assert_eq!(entry.artifact_path, INSTALLED);
    assert_eq!(entry.module.as_deref(), Some("org.example:tool"));
    assert!(resolved.blobs.is_empty());
}

#[test]
fn a_link_with_no_integrity_is_pinned_and_one_that_is_not_there_names_the_library() {
    let server = TestServer::start(|request| match request.target.as_str() {
        "/tool.jar" => Reply::json("jar bytes"),
        _ => Reply::status(404),
    });
    let link = |file: &str| {
        library(tool(
            json!({ "source": { "url": format!("{}/{file}", server.base) } }),
        ))
    };
    let resolved = resolve_libraries(&[link("tool.jar")]).expect("resolved");
    let (artifact, _) = &resolved.entries[0];
    assert_eq!(artifact.size, Some(9));
    assert!(format!("{:?}", artifact.integrity).contains(&blob_id(b"jar bytes")));
    assert!(matches!(&artifact.source, Source::Url { url } if url.ends_with("/tool.jar")));

    let error = resolve_libraries(&[link("gone.jar")])
        .expect_err("refused")
        .to_string();
    assert!(error.contains("library 'org.example:tool:1.2'"), "{error}");
}

#[test]
fn a_file_becomes_a_blob_and_the_table_says_where_it_is() {
    let dir = tempfile::tempdir().expect("a directory");
    let jar = dir.path().join("tool.jar");
    std::fs::write(&jar, b"local jar").expect("written");

    let resolved = resolve_libraries(&[library(tool(json!({ "source": { "file": jar } })))])
        .expect("resolved");

    let id = blob_id(b"local jar");
    let (artifact, _) = &resolved.entries[0];
    assert_eq!(artifact.path, INSTALLED);
    assert_eq!(artifact.source, Source::Blob { blob: id.clone() });
    assert_eq!(artifact.size, Some(9));
    assert_eq!(resolved.blobs.get(&id), Some(&BlobSource::File(jar)));

    let missing = resolve_libraries(&[library(tool(json!({
        "source": { "file": dir.path().join("none.jar") },
    })))])
    .expect_err("refused")
    .to_string();
    assert!(missing.contains("cannot read"), "{missing}");
}

#[test]
fn two_libraries_at_one_path_are_refused_before_anything_is_fetched() {
    // Nothing listens here, and neither link carries its integrity: a
    // request would fail the test with a different error.
    let at = |rules: &str| {
        library(tool(
            json!({ "source": { "url": "http://127.0.0.1:1/t.jar" }, "rules": rules }),
        ))
    };
    let error = resolve_libraries(&[at("allow.os.linux"), at("allow.os.osx")])
        .expect_err("refused")
        .to_string();
    assert!(
        error.contains("are both installed at 'org/example/tool/1.2/tool-1.2.jar'"),
        "{error}"
    );
}

#[test]
fn a_natives_bundle_is_unpacked_and_supersedes_nothing() {
    let natives = |fields: Value| {
        let mut raw = tool(fields);
        raw["name"] = json!("org.lwjgl:lwjgl:3.3.1:natives-linux");
        resolve_libraries(&[library(raw)]).expect("resolved")
    };
    let pinned =
        json!({ "source": { "url": "https://x/n.jar" }, "integrity": { "sha1": "c".repeat(40) } });
    let resolved = natives(pinned.clone());
    let (artifact, entry) = &resolved.entries[0];
    assert!(format!("{:?}", artifact.extract).contains("natives_directory"));
    assert_eq!(entry.module, None);

    // What the library says about its own extraction is what happens.
    let mut own = pinned;
    own["extract"] = json!({ "into": "${root}/elsewhere" });
    let resolved = natives(own);
    assert!(format!("{:?}", resolved.entries[0].0.extract).contains("elsewhere"));
}

// ── how one is folded ───────────────────────────────────────────────────

/// A newer gson than the version's own, with `fields` beside its artifact's.
fn gson_2_11(fields: Value) -> Value {
    let mut raw = tool(fields);
    raw["name"] = json!("com.google.code.gson:gson:2.11.0");
    raw["artifact"]["path"] = json!("com/google/code/gson/gson/2.11.0/gson-2.11.0.jar");
    raw["artifact"]["source"] = json!({ "url": "https://x/gson.jar" });
    raw["artifact"]["integrity"] = json!({ "sha1": "c".repeat(40) });
    raw
}

#[test]
fn an_added_library_goes_ahead_of_everything_on_the_classpath() {
    let before = template();
    let resolved =
        resolve_libraries(&[library(pinned("https://example.com/tool.jar"))]).expect("resolved");
    let after = with_libraries(before.clone(), resolved).expect("folded");

    let mut expected = vec!["${library_directory}/org/example/tool/1.2/tool-1.2.jar".to_owned()];
    expected.extend(classpath(&before));
    assert_eq!(classpath(&after), expected);
    assert_eq!(after.artifacts.len(), before.artifacts.len() + 1);
    assert_eq!(after.classpath, {
        let Some(ValDef::Arms(arms)) = after.vars.get("classpath") else {
            panic!()
        };
        arms.clone()
    });
}

#[test]
fn a_library_of_the_same_module_replaces_the_versions_own() {
    let before = template();
    let old = "${library_directory}/com/google/code/gson/gson/2.10.1/gson-2.10.1.jar";
    let new = "${library_directory}/com/google/code/gson/gson/2.11.0/gson-2.11.0.jar";
    assert!(classpath(&before).contains(&old.to_owned()));

    let resolved = resolve_libraries(&[library(gson_2_11(json!({})))]).expect("resolved");
    let after = with_libraries(before.clone(), resolved).expect("folded");

    let cp = classpath(&after);
    assert_eq!(cp[0], new);
    assert!(!cp.contains(&old.to_owned()));
    // What left the classpath is no longer downloaded either.
    assert!(!after.artifacts.iter().any(|a| a.path == old));
    assert!(after.artifacts.iter().any(|a| a.path == new));
    assert_eq!(after.artifacts.len(), before.artifacts.len());
}

#[test]
fn a_rule_keeps_a_library_off_the_classpath_of_the_others() {
    let resolved = resolve_libraries(&[library(tool(json!({
        "source": { "url": "https://x/t.jar" },
        "integrity": { "sha1": "c".repeat(40) },
        "rules": "allow.os.osx",
    })))])
    .expect("resolved");
    let before = template();
    let after = with_libraries(before.clone(), resolved).expect("folded");
    // Linux is as it was; the artifact is there, gated by the same rule.
    assert_eq!(classpath(&after), classpath(&before));
    assert_eq!(after.artifacts.last().expect("added").rules.len(), 1);
}

#[test]
fn a_library_with_rules_still_replaces_the_versions_own_everywhere() {
    let old = "${library_directory}/com/google/code/gson/gson/2.10.1/gson-2.10.1.jar";
    let linux_only = gson_2_11(json!({ "rules": "allow.os.linux" }));
    let before = template();
    let after = with_libraries(
        before.clone(),
        resolve_libraries(&[library(linux_only.clone())]).expect("resolved"),
    )
    .expect("folded");

    // The version's copy is gone for every OS, downloads included: an
    // override is whole, and what the other systems run is the author's to
    // say.
    assert!(classpath(&after)[0].ends_with("gson-2.11.0.jar"));
    assert!(!classpath(&after).contains(&old.to_owned()));
    assert!(!after.artifacts.iter().any(|a| a.path == old));
    let Some(ValDef::Arms(arms)) = after.vars.get("classpath") else {
        panic!("classpath is not per-OS");
    };
    assert!(arms
        .iter()
        .filter(|arm| !format!("{:?}", arm.rules).contains("Linux"))
        .all(|arm| !arm.value.contains("/gson/")));

    // Said for each OS, each gets its own.
    let mut elsewhere = gson_2_11(json!({ "rules": "disallow.os.linux" }));
    elsewhere["artifact"]["path"] = json!("com/google/code/gson/gson/2.10.1/gson-2.10.1.jar");
    let both = with_libraries(
        before,
        resolve_libraries(&[library(linux_only), library(elsewhere)]).expect("resolved"),
    )
    .expect("folded");
    assert!(arms_with_gson(&both) == 3);
}

/// How many of the three per-OS classpaths have exactly one gson on them.
fn arms_with_gson(t: &MinecraftTemplate) -> usize {
    let Some(ValDef::Arms(arms)) = t.vars.get("classpath") else {
        panic!("classpath is not per-OS");
    };
    arms.iter()
        .filter(|arm| arm.value.matches("/gson/").count() == 1)
        .count()
}

#[test]
fn nothing_to_add_changes_nothing_and_asks_for_nothing() {
    let before = template();
    assert_eq!(
        add_libraries(before.clone(), &[]).expect("unchanged"),
        before
    );
}
