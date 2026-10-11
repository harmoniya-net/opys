//! The file, an entry, and what one side of it resolves to.

mod common;

use std::path::Path;

use common::{Reply, TestServer};
use opys_links::LinkOptions;
use opys_minecraft_resources::{
    build_resources, parse_resources, parse_source, read_resources, resolve_resources,
    resource_artifacts, EntrySource, ResourceFile, ResourceSource, ResourcesOptions, Side,
};
use serde_json::{json, Value};

const FILE: &str = r#"
[common.mods]
lithium = "modrinth:lithium@0.15.0"

[client.mods]
jei = "curseforge:jei@77"
sodium = "modrinth:sodium@0.6.13#fabric"

[client.resourcepacks]
faithful = "curseforge:faithful@88"

[server.plugins]
luckperms = "modrinth:luckperms@5.4"
"#;

fn parse(text: &str) -> Result<ResourceFile, String> {
    parse_resources(text, "resources.toml").map_err(|e| e.to_string())
}

// ── a source ──────────────────────────────────────────────────────────────

#[test]
fn a_source_is_a_project_and_a_version_a_file_or_a_link() {
    assert_eq!(
        parse_source("modrinth:sodium@mc1.21.1-0.6.13-fabric").unwrap(),
        EntrySource::Modrinth {
            project: "sodium".into(),
            version: "mc1.21.1-0.6.13-fabric".into(),
            loader: None,
        }
    );
    assert_eq!(
        parse_source("modrinth:jei@19.51.0.418#fabric").unwrap(),
        EntrySource::Modrinth {
            project: "jei".into(),
            version: "19.51.0.418".into(),
            loader: Some("fabric".into()),
        }
    );
    assert_eq!(
        parse_source("curseforge:jei@5846880").unwrap(),
        EntrySource::CurseForge {
            project: "jei".into(),
            file_id: 5846880,
        }
    );
    let link = "https://github.com/o/r/releases/download/v1/x.jar";
    assert_eq!(parse_source(link).unwrap(), EntrySource::Url(link.into()));
    assert_eq!(
        parse_source("file:local/my mod.jar").unwrap(),
        EntrySource::File("local/my mod.jar".into())
    );
    assert_eq!(
        parse_source("file:config/").unwrap(),
        EntrySource::File("config/".into())
    );
}

#[test]
fn a_loader_is_what_follows_the_last_hash_and_is_modrinths_alone() {
    // A version number may hold a `#` of its own, and an `@`.
    assert_eq!(
        parse_source("modrinth:x@1.0#beta@2#quilt").unwrap(),
        EntrySource::Modrinth {
            project: "x".into(),
            version: "1.0#beta@2".into(),
            loader: Some("quilt".into()),
        }
    );
    let message = parse_source("curseforge:jei@77#fabric")
        .unwrap_err()
        .to_string();
    assert!(message.contains("means nothing here"), "{message}");
}

#[test]
fn a_source_with_no_version_is_refused_and_told_how_to_have_one() {
    for (source, shown) in [
        ("modrinth:sodium", "modrinth:sodium"),
        ("modrinth:sodium@", "modrinth:sodium"),
        ("curseforge:jei", "curseforge:jei"),
        ("curseforge:jei@", "curseforge:jei"),
    ] {
        let message = parse_source(source).unwrap_err().to_string();
        assert!(
            message.contains(&format!("write `{shown}@<version>`")),
            "{message}"
        );
    }
}

#[test]
fn what_is_no_source_at_all_is_refused_with_the_spellings() {
    for source in [
        "sodium",
        "sodium@0.8.13",
        "modrinth:",
        "modrinth:@1.0",
        "modrinth:sodium@1.0#",
        "curseforge:@7",
        "github:o/r@v1",
        "mods/a.jar",
        "file:",
        "file:/",
        "",
    ] {
        let message = parse_source(source).unwrap_err().to_string();
        assert!(message.contains("is not a resource"), "{source}: {message}");
    }
    let message = parse_source("curseforge:jei@latest")
        .unwrap_err()
        .to_string();
    assert!(message.contains("\"latest\" is not one"), "{message}");
}

// ── an entry ──────────────────────────────────────────────────────────────

fn entry(toml: &str) -> Result<opys_minecraft_resources::Entry, String> {
    parse(&format!("[client.mods]\nx = {toml}")).map(|file| file.client["mods"]["x"].clone())
}

#[test]
fn an_entry_is_its_source_alone_or_a_table_with_what_else_there_is_to_say() {
    let plain = entry(r#""modrinth:sodium@1.0""#).unwrap();
    let tabled = entry(r#"{ source = "modrinth:sodium@1.0" }"#).unwrap();
    assert_eq!(plain, tabled);
    assert_eq!(plain.metadata, None);

    let with = entry(r#"{ source = "file:a.jar", metadata = { optional = true, tags = ["a"] } }"#)
        .unwrap();
    assert_eq!(with.source, EntrySource::File("a.jar".into()));
    assert_eq!(
        Value::Object(with.metadata.unwrap()),
        json!({ "optional": true, "tags": ["a"] })
    );
}

#[test]
fn github_and_gitlab_are_written_as_fields() {
    let github = entry(r#"{ github = { repo = "o/r", tag = "v1", asset = "a.jar" } }"#).unwrap();
    assert!(
        matches!(&github.source, EntrySource::GitHub(a) if a.repo == "o/r" && a.asset.as_deref() == Some("a.jar"))
    );
    let bare = entry(r#"{ github = { repo = "o/r", tag = "v1" } }"#).unwrap();
    assert!(matches!(&bare.source, EntrySource::GitHub(a) if a.asset.is_none()));

    let gitlab = entry(
        r#"{ gitlab = { project = "g/p", package = "p", version = "1", asset = "p.jar", host = "https://git.test" }, metadata = { a = 1 } }"#,
    )
    .unwrap();
    assert!(
        matches!(&gitlab.source, EntrySource::GitLab(f) if f.host.as_deref() == Some("https://git.test"))
    );
    assert!(gitlab.metadata.is_some());

    let message = entry(r#"{ gitlab = { project = "g/p" } }"#).unwrap_err();
    assert!(message.contains("missing field `package`"), "{message}");
}

#[test]
fn an_entry_has_one_source() {
    let message = entry(r#"{ metadata = { a = 1 } }"#).unwrap_err();
    assert!(message.contains("this one has none"), "{message}");
    let message =
        entry(r#"{ source = "file:a.jar", github = { repo = "o/r", tag = "v1" } }"#).unwrap_err();
    assert!(message.contains("this one has more than one"), "{message}");
    let message = entry("7").unwrap_err();
    assert!(message.contains("or a table"), "{message}");
}

#[test]
fn a_field_an_entry_does_not_know_is_left_alone() {
    let known = entry(r#"{ source = "file:a.jar" }"#).unwrap();
    let extra = entry(r#"{ source = "file:a.jar", note = "for the panel", optinal = true }"#);
    assert_eq!(extra.unwrap(), known);
    let github = entry(r#"{ github = { repo = "o/r", tag = "v1", branch = "main" }, pinned = 1 }"#);
    assert!(github.is_ok());
}

#[test]
fn a_bad_source_is_a_bad_file_and_says_where() {
    let message = parse("[client.mods]\nsodium = \"modrinth:sodium\"").unwrap_err();
    assert!(message.contains("resources.toml"), "{message}");
    assert!(
        message.contains("write `modrinth:sodium@<version>`"),
        "{message}"
    );
}

// ── the file ──────────────────────────────────────────────────────────────

#[test]
fn a_side_takes_the_common_table_and_then_its_own() {
    let file = parse(FILE).unwrap();
    let shown = |side| -> Vec<String> { file.entries(side).map(|listed| listed.label()).collect() };
    assert_eq!(
        shown(Side::Client),
        [
            "mods.lithium",
            "mods.jei",
            "mods.sodium",
            "resourcepacks.faithful"
        ]
    );
    assert_eq!(shown(Side::Server), ["mods.lithium", "plugins.luckperms"]);
}

#[test]
fn an_empty_file_is_a_pack_of_nothing() {
    let file = parse("").unwrap();
    assert_eq!(file.entries(Side::Client).count(), 0);
    assert!(file.dirs.is_empty());
}

#[test]
fn a_table_that_is_no_directory_or_no_side_is_refused() {
    let message = parse("[client.resoucepacks]\na = \"file:a.zip\"").unwrap_err();
    assert!(message.contains("resources.toml"), "{message}");
    assert!(
        message.contains("`resoucepacks` is no directory this file knows"),
        "{message}"
    );
    assert!(message.contains("`resourcepacks`"), "{message}");

    let message = parse("[both.mods]\na = \"file:a.jar\"").unwrap_err();
    assert!(message.contains("unknown field `both`"), "{message}");
    // What used to be at the top of a file is now said per entry.
    let message = parse("loader = \"fabric\"").unwrap_err();
    assert!(message.contains("unknown field `loader`"), "{message}");
}

#[test]
fn a_directory_of_the_packs_own_is_named_in_dirs_with_where_it_is() {
    let file = parse(
        r#"
[dirs]
kubejs = "${game_directory}/kubejs/server_scripts/"
branding = "${root}/launcher/branding"
mods = "${root}/shared-mods"

[common.kubejs]
a = "file:a.js"
[common.branding]
logo = "file:logo.png"
[common.mods]
a = "file:a.jar"
[common.resourcepacks]
p = "file:p.zip"
"#,
    )
    .unwrap();
    let at = |name, side| file.dir_path(name, side);
    // A client keeps them where the file says, a built-in one under its name.
    assert_eq!(
        at("kubejs", Side::Client),
        "${game_directory}/kubejs/server_scripts"
    );
    assert_eq!(at("branding", Side::Client), "${root}/launcher/branding");
    assert_eq!(at("mods", Side::Client), "${root}/shared-mods");
    assert_eq!(
        at("resourcepacks", Side::Client),
        "${game_directory}/resourcepacks"
    );
    // A server's game directory is its root.
    assert_eq!(at("kubejs", Side::Server), "${root}/kubejs/server_scripts");
    assert_eq!(at("resourcepacks", Side::Server), "${root}/resourcepacks");
    assert_eq!(at("branding", Side::Server), "${root}/launcher/branding");
}

#[test]
fn a_directory_under_no_variable_is_refused() {
    for path in ["kubejs", "/srv/kubejs", "../kubejs"] {
        let message = parse(&format!("[dirs]\nkubejs = \"{path}\"")).unwrap_err();
        assert!(message.contains("which is under no variable"), "{message}");
        assert!(message.contains("${game_directory}"), "{message}");
    }
}

#[test]
fn a_key_is_one_name_and_is_one_file_for_a_side() {
    for key in ["a/b", "..", "a\\\\b", ""] {
        let message = parse(&format!("[client.mods]\n\"{key}\" = \"file:a.jar\"")).unwrap_err();
        assert!(
            message.contains("is no name for a file"),
            "{key}: {message}"
        );
    }
    let message =
        parse("[common.mods]\nsodium = \"file:a.jar\"\n[server.mods]\nsodium = \"file:b.jar\"")
            .unwrap_err();
    assert!(
        message.contains("`mods.sodium` is in both `[common.mods]` and `[server.mods]`"),
        "{message}"
    );
    // The two sides are two packs, and may each have their own.
    assert!(parse(
        "[client.mods]\nsodium = \"file:a.jar\"\n[server.mods]\nsodium = \"file:b.jar\""
    )
    .is_ok());
}

#[test]
fn a_file_is_written_back_as_what_it_decodes_from() {
    let text = format!(
        "{FILE}\n[client.shaderpacks]\na = {{ source = \"file:a.zip\", metadata = {{ k = 1 }} }}\nb = {{ github = {{ repo = \"o/r\", tag = \"v1\" }} }}\n"
    );
    let file = parse(&text).unwrap();
    let json = serde_json::to_value(&file).unwrap();
    // Its source alone where that is all there is, and a table otherwise.
    assert_eq!(json["client"]["mods"]["jei"], "curseforge:jei@77");
    assert_eq!(
        json["client"]["mods"]["sodium"],
        "modrinth:sodium@0.6.13#fabric"
    );
    assert_eq!(
        json["client"]["shaderpacks"]["a"],
        json!({ "source": "file:a.zip", "metadata": { "k": 1 } })
    );
    assert_eq!(
        json["client"]["shaderpacks"]["b"],
        json!({ "github": { "repo": "o/r", "tag": "v1" } })
    );
    let again: ResourceFile = serde_json::from_value(json).unwrap();
    assert_eq!(again, file);
}

// ── resolving ─────────────────────────────────────────────────────────────

fn modrinth_version(id: &str, number: &str, loader: &str) -> Value {
    json!({
        "id": id, "project_id": "P", "version_number": number,
        "loaders": [loader], "game_versions": ["1.21.1"],
        "files": [{
            "hashes": { "sha1": "a".repeat(40) },
            "url": format!("https://cdn.modrinth.test/{id}-{number}.jar"),
            "filename": format!("{id}-{number}.jar"), "primary": true, "size": 10,
        }],
    })
}

/// Modrinth, CurseForge, GitHub and a plain host on one port, told apart by
/// path.
fn providers() -> TestServer {
    TestServer::start(|request| {
        let body: Value = serde_json::from_str(&request.body).unwrap_or_default();
        let ids = |key: &str| -> Vec<u64> {
            body[key]
                .as_array()
                .map(|a| a.iter().filter_map(Value::as_u64).collect())
                .unwrap_or_default()
        };
        let release = |assets: &[&str]| {
            let assets: Vec<Value> = assets
                .iter()
                .map(|name| {
                    json!({
                        "name": name, "size": 30,
                        "browser_download_url": format!("https://github.test/{name}"),
                        "digest": format!("sha256:{}", "c".repeat(64)),
                    })
                })
                .collect();
            Reply::json(json!({ "tag_name": "v1", "assets": assets }).to_string())
        };
        match request.target.as_str() {
            "/project/lithium/version?include_changelog=false" => {
                Reply::json(json!([modrinth_version("lith", "0.15.0", "fabric")]).to_string())
            }
            // One number, two loaders: the entry's loader is what chooses.
            "/project/sodium/version?include_changelog=false" => Reply::json(
                json!([
                    modrinth_version("sod-neo", "0.6.13", "neoforge"),
                    modrinth_version("sod-fab", "0.6.13", "fabric"),
                ])
                .to_string(),
            ),
            "/mods/files" => {
                // As the real API does: 404 when it knows none of them.
                if ids("fileIds").iter().all(|id| *id >= 9000) {
                    return Reply::status(404);
                }
                let data: Vec<Value> = ids("fileIds")
                    .into_iter()
                    .filter(|id| *id < 9000)
                    .rev()
                    .map(|id| {
                        json!({
                            "id": id, "modId": id * 10, "fileName": format!("cf-{id}.zip"),
                            "fileLength": 20,
                            "hashes": [{ "value": "b".repeat(40), "algo": 1 }],
                            "downloadUrl": format!("https://edge.forgecdn.test/cf-{id}.zip"),
                        })
                    })
                    .collect();
                Reply::json(json!({ "data": data }).to_string())
            }
            "/mods" => {
                let data: Vec<Value> = ids("modIds")
                    .into_iter()
                    .map(|id| {
                        let slug = match id {
                            770 => "jei",
                            880 => "faithful",
                            _ => "other",
                        };
                        json!({ "id": id, "slug": slug })
                    })
                    .collect();
                Reply::json(json!({ "data": data }).to_string())
            }
            "/repos/o/one/releases/tags/v1" => release(&["only.jar"]),
            "/repos/o/two/releases/tags/v1" => release(&["a-fabric.jar", "a-neoforge.jar"]),
            "/files/plain.jar" => Reply::json("jar bytes"),
            _ => Reply::status(404),
        }
    })
}

fn options(server: &TestServer, token: Option<&str>) -> LinkOptions {
    LinkOptions {
        curseforge_token: token.map(str::to_owned),
        github_api: Some(server.base.clone()),
        modrinth_api: Some(server.base.clone()),
        curseforge_api: Some(server.base.clone()),
        ..LinkOptions::default()
    }
}

/// Where a file that lists nothing from disk is: it is not looked at.
const NOWHERE: &str = "/nowhere";

fn resolve(
    file: &ResourceFile,
    side: Side,
    options: &LinkOptions,
) -> Result<Vec<opys_minecraft_resources::ResolvedResource>, String> {
    resolve_resources(file, side, Path::new(NOWHERE), options).map_err(|e| e.to_string())
}

#[test]
fn a_file_is_named_by_its_key_with_the_extension_it_turned_out_to_have() {
    let server = providers();
    let text = format!(
        "{FILE}\n[client.shaderpacks]\nplain = \"{}/files/plain.jar\"\n\"options.txt\" = \"{}/files/plain.jar\"\n",
        server.base, server.base
    );
    let file = parse(&text).unwrap();
    let files = resolve(&file, Side::Client, &options(&server, Some("key"))).unwrap();

    let shown: Vec<(&str, &str)> = files
        .iter()
        .map(|file| (file.dir.as_str(), file.path.as_str()))
        .collect();
    assert_eq!(
        shown,
        [
            // Not `lith-0.15.0.jar`: the next version is the same file.
            ("mods", "lithium.jar"),
            ("mods", "jei.zip"),
            ("mods", "sodium.jar"),
            ("resourcepacks", "faithful.zip"),
            // A key with a dot is the whole name.
            ("shaderpacks", "options.txt"),
            ("shaderpacks", "plain.jar"),
        ]
    );
    // The loader chose between two versions of one number.
    assert_eq!(
        files[2].source,
        ResourceSource::Url {
            url: "https://cdn.modrinth.test/sod-fab-0.6.13.jar".into()
        }
    );
    // A link nobody vouches for was downloaded and hashed.
    assert!(matches!(
        files[5].integrity,
        Some(opys_core::HashEntry::Sha256 { .. })
    ));
}

#[test]
fn a_shared_number_with_no_loader_said_is_not_picked() {
    let server = providers();
    let file = parse("[client.mods]\nsodium = \"modrinth:sodium@0.6.13\"").unwrap();
    let message = resolve(&file, Side::Client, &options(&server, None)).unwrap_err();
    assert!(message.contains("say its loader"), "{message}");
}

#[test]
fn a_file_of_another_project_than_the_one_written_is_refused() {
    let server = providers();
    let file = parse("[client.mods]\nsodium = \"curseforge:sodium@77\"").unwrap();
    let message = resolve(&file, Side::Client, &options(&server, Some("key"))).unwrap_err();
    assert_eq!(
        message,
        "`mods.sodium`: file 77 belongs to the CurseForge project \"jei\""
    );
}

#[test]
fn a_curseforge_file_there_is_not_is_said_by_the_entry_it_was_written_on() {
    let server = providers();
    // Alone, the API answers 404; beside a file it knows, it leaves it out.
    for known in ["", "jei = \"curseforge:jei@77\"\n"] {
        let file = parse(&format!(
            "[client.mods]\n{known}typo = \"curseforge:jei@9001\""
        ))
        .unwrap();
        let message = resolve(&file, Side::Client, &options(&server, Some("key"))).unwrap_err();
        assert_eq!(message, "`mods.typo`: CurseForge has no file 9001");
    }
}

#[test]
fn curseforge_needs_a_key_only_where_a_side_names_curseforge() {
    let server = providers();
    let file = parse(FILE).unwrap();
    let message = resolve(&file, Side::Client, &options(&server, None)).unwrap_err();
    assert!(message.contains("`mods.jei`"), "{message}");
    assert!(message.contains("curseforgeToken"), "{message}");

    // The server side names none, and asks for none: `luckperms` is not on
    // this Modrinth, so it fails there and not on a key.
    let message = resolve(&file, Side::Server, &options(&server, None)).unwrap_err();
    assert!(message.contains("404"), "{message}");
}

#[test]
fn a_github_asset_is_the_one_named_or_the_only_one() {
    let server = providers();
    let file = parse(
        r#"
[client.mods]
named = { github = { repo = "o/two", tag = "v1", asset = "a-fabric.jar" }, metadata = { from = "github" } }
only = { github = { repo = "o/one", tag = "v1" } }
"#,
    )
    .unwrap();
    let files = resolve(&file, Side::Client, &options(&server, None)).unwrap();
    assert_eq!(files[0].path, "named.jar");
    assert_eq!(
        files[0].source,
        ResourceSource::Url {
            url: "https://github.test/a-fabric.jar".into()
        }
    );
    assert_eq!(files[1].path, "only.jar");
    assert_eq!(
        files[1].source,
        ResourceSource::Url {
            url: "https://github.test/only.jar".into()
        }
    );
    assert!(matches!(
        files[1].integrity,
        Some(opys_core::HashEntry::Sha256 { .. })
    ));

    let vague =
        parse("[client.mods]\nx = { github = { repo = \"o/two\", tag = \"v1\" } }").unwrap();
    let message = resolve(&vague, Side::Client, &options(&server, None)).unwrap_err();
    assert_eq!(
        message,
        "`mods.x`: the release v1 of o/two has 2 assets, so say which with `asset`: a-fabric.jar, a-neoforge.jar"
    );
}

#[test]
fn nothing_listed_asks_nobody() {
    let server = providers();
    let file = parse("[dirs]\nx = \"${root}/x\"").unwrap();
    let files = resolve(&file, Side::Client, &options(&server, None)).unwrap();
    assert!(files.is_empty());
    assert!(server.requests().is_empty());
}

// ── the plugin ────────────────────────────────────────────────────────────

fn paths(artifacts: &[opys_dev::BuildArtifact]) -> Vec<String> {
    artifacts
        .iter()
        .map(|artifact| artifact.path().unwrap().to_owned())
        .collect()
}

#[test]
fn a_file_goes_into_its_directory_as_the_side_places_it_with_its_metadata() {
    let server = providers();
    let file = parse(
        "[common.mods]\nlithium = { source = \"modrinth:lithium@0.15.0\", metadata = { optional = true } }",
    )
    .unwrap();
    let files = resolve(&file, Side::Server, &options(&server, None)).unwrap();
    assert_eq!(
        paths(&resource_artifacts(&files, &file, Side::Server)),
        ["${root}/mods/lithium.jar"]
    );
    let client = resource_artifacts(&files, &file, Side::Client);
    assert_eq!(paths(&client), ["${game_directory}/mods/lithium.jar"]);
    let json = serde_json::to_value(&client[0]).unwrap();
    assert_eq!(json["size"], 10);
    assert!(json["integrity"]["sha1"].is_string());
    assert_eq!(json["metadata"], json!({ "optional": true }));
}

// ── files from disk ───────────────────────────────────────────────────────

/// A pack's folder: a mod, and a `config` tree two levels deep.
fn pack() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    let write = |rel: &str, text: &str| {
        let path = dir.path().join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    };
    write("local/my-mod-1.2.jar", "jar");
    write("config/b.json", "{}");
    write("config/jei/a.ini", "x=1");
    dir
}

fn from_disk(
    dir: &Path,
    text: &str,
    side: Side,
) -> Result<(ResourceFile, Vec<opys_dev::BuildArtifact>), String> {
    let file = parse(text)?;
    let files =
        resolve_resources(&file, side, dir, &LinkOptions::default()).map_err(|e| e.to_string())?;
    let artifacts = resource_artifacts(&files, &file, side);
    Ok((file, artifacts))
}

#[test]
fn a_file_entry_is_a_file_beside_the_resources_file_and_is_carried() {
    let dir = pack();
    let (_, artifacts) = from_disk(
        dir.path(),
        "[client.mods]\nmine = { source = \"file:local/my-mod-1.2.jar\", metadata = { own = true } }",
        Side::Client,
    )
    .unwrap();
    assert_eq!(paths(&artifacts), ["${game_directory}/mods/mine.jar"]);
    // The file itself, for the build to hash and carry, with its metadata.
    let json = serde_json::to_value(&artifacts[0]).unwrap();
    assert_eq!(
        json["source"]["file"],
        dir.path().join("local/my-mod-1.2.jar").to_str().unwrap()
    );
    assert_eq!(json["metadata"], json!({ "own": true }));
}

#[test]
fn a_folder_goes_into_a_folder_of_its_key_or_with_a_dot_into_the_directory() {
    let dir = pack();
    let text = |key: &str| {
        format!(
            "[dirs]\nconfig = \"${{game_directory}}/config\"\n[common.config]\n{key} = {{ source = \"file:config/\", metadata = {{ k = 1 }} }}"
        )
    };
    let (_, named) = from_disk(dir.path(), &text("shared"), Side::Server).unwrap();
    assert_eq!(
        paths(&named),
        [
            "${root}/config/shared/b.json",
            "${root}/config/shared/jei/a.ini"
        ]
    );
    // Its metadata is on every file of it.
    for artifact in &named {
        assert_eq!(
            serde_json::to_value(artifact).unwrap()["metadata"],
            json!({ "k": 1 })
        );
    }
    let (_, own) = from_disk(dir.path(), &text("\".\""), Side::Server).unwrap();
    assert_eq!(
        paths(&own),
        ["${root}/config/b.json", "${root}/config/jei/a.ini"]
    );
}

#[test]
fn a_file_that_is_not_there_and_a_folder_taken_for_a_file_are_refused() {
    let dir = pack();
    let resolve = |key: &str, source: &str| {
        from_disk(
            dir.path(),
            &format!("[client.mods]\n{key} = \"{source}\""),
            Side::Client,
        )
        .unwrap_err()
    };
    assert!(resolve("x", "file:local/none.jar").contains("`mods.x`: there is no file at"));
    assert_eq!(
        resolve("x", "file:config"),
        "`mods.x` is a folder: end its path with `/` to take every file in it"
    );
    assert!(resolve("x", "file:nothing/").contains("there is no folder at"));
    assert!(resolve("x", "file:local/my-mod-1.2.jar/").contains("there is no folder at"));
    assert!(resolve("\".\"", "file:local/my-mod-1.2.jar").contains("this is one file"));
}

#[test]
fn the_plugin_contributes_the_side_it_was_given_with_files_beside_its_base() {
    let server = providers();
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("own.zip"), "zip").unwrap();
    let file = parse(&format!(
        "{FILE}\nown = \"file:own.zip\"\n[dirs]\nmods = \"${{root}}/instance/mods\"\n"
    ))
    .unwrap();

    // The tables cross as they serialise, which is what a config hands over.
    let options: ResourcesOptions = serde_json::from_value(json!({
        "side": "server",
        "resources": file,
        "base": dir.path(),
        "modrinthApi": server.base,
    }))
    .unwrap();
    // `luckperms` is not on this Modrinth; without it the side resolves.
    let message = build_resources(&options).unwrap_err().to_string();
    assert!(message.contains("404"), "{message}");

    let options: ResourcesOptions = serde_json::from_value(json!({
        "side": "client",
        "resources": file,
        "base": dir.path(),
        "curseforgeToken": "key",
        "modrinthApi": server.base,
        "curseforgeApi": server.base,
    }))
    .unwrap();
    let output = build_resources(&options).unwrap();
    assert_eq!(output.name, "resources");
    assert_eq!(
        paths(&output.contribution.artifacts),
        [
            "${root}/instance/mods/lithium.jar",
            "${root}/instance/mods/jei.zip",
            "${root}/instance/mods/sodium.jar",
            "${game_directory}/resourcepacks/faithful.zip",
        ]
    );
}

#[test]
fn tables_written_in_part_are_a_file_and_a_file_that_is_not_there_is_said_by_its_path() {
    let options: ResourcesOptions = serde_json::from_value(json!({
        "side": "server",
        "resources": { "server": { "plugins": {} } },
        "base": "/nowhere",
    }))
    .unwrap();
    let output = build_resources(&options).unwrap();
    assert!(output.contribution.artifacts.is_empty());

    let message = read_resources(Path::new("/nowhere/resources.toml"))
        .unwrap_err()
        .to_string();
    assert!(
        message.starts_with("/nowhere/resources.toml: "),
        "{message}"
    );
}
