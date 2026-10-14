//! The cores, asked.
//!
//! Each answers the same three questions in its own API's words: which
//! versions it has, which builds of one, and which file a version and a
//! build come to. A core is a pure half (which URL, which field of the
//! answer) and one request apiece. Whoever publishes a hash is asked for
//! it; a file nobody vouches for is downloaded here, once, and hashed.
//!
//! A list is newest first and holds what a core calls stable, since it is
//! what an author picks from. Naming a pre-release outright still resolves.

use indexmap::IndexMap;
use opys_cleanroom::{
    fetch_document, list_cleanroom_releases, CleanroomRelease, DEFAULT_CLEANROOM_INDEX,
};
use opys_core::{allow_os_ruleset, ConditionalVal, OsName, ValDef, ValDefs};
use opys_dev::http::get_json;
use opys_dev::pin::{pin_url, PinError};
use opys_dev::{BuildArtifact, JsonGetError};
use opys_minecraft_vanilla::{
    classpath_entries, classpath_of, fetch_client, fetch_version_manifest, library_to_artifact,
    ClasspathEntry,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::error::ServerError;
use crate::options::{Apis, Core, JarSource, ServerCore, ServerOptions};
use crate::starter::{predates_starter, REINSTALL, STARTER_SHA256, STARTER_SIZE, STARTER_URL};

const PAPER_API: &str = "https://fill.papermc.io";
const PURPUR_API: &str = "https://api.purpurmc.org";
const FABRIC_META: &str = "https://meta.fabricmc.net";
const FORGE_FILES: &str = "https://files.minecraftforge.net";
const FORGE_MAVEN: &str = "https://maven.minecraftforge.net";
const NEOFORGE_MAVEN: &str = "https://maven.neoforged.net";

pub(crate) const JAR_PATH: &str = "${root}/server.jar";
/// Named so that the starter finds it: it runs the file in its folder
/// whose name ends in `installer.jar`.
const INSTALLER_PATH: &str = "${root}/installer.jar";

fn base<'a>(given: &'a Option<String>, own: &'static str) -> &'a str {
    given.as_deref().unwrap_or(own)
}

/// A pre-release says so after a dash, in every core that has them:
/// `1.21.11-rc3`, `26.3.0.69-beta`.
fn stable(id: &str) -> bool {
    !id.contains('-')
}

fn newest_first(mut oldest_first: Vec<String>) -> Vec<String> {
    oldest_first.reverse();
    oldest_first
}

/// A core that has no such version, or no such build of it, in place of the
/// 404 its API answered with.
fn none_such(core: Core, version: &str, build: Option<&str>) -> ServerError {
    ServerError::NoBuild {
        core,
        version: version.to_owned(),
        build: build.map(str::to_owned),
    }
}

fn found<T>(
    asked: Result<T, JsonGetError>,
    missing: impl FnOnce() -> ServerError,
) -> Result<T, ServerError> {
    asked.map_err(|e| match e {
        JsonGetError::Status { status: 404, .. } => missing(),
        other => other.into(),
    })
}

// ── files ─────────────────────────────────────────────────────────────────

fn artifact(fields: serde_json::Value) -> BuildArtifact {
    serde_json::from_value(fields).expect("an artifact this crate spelled itself")
}

/// A published file with the hash its publisher gives.
fn published(path: &str, url: &str, size: Option<u64>, hash: (&str, &str)) -> BuildArtifact {
    let mut fields = json!({
        "path": path,
        "source": { "url": url },
        "integrity": { hash.0: hash.1 },
    });
    if let Some(size) = size {
        fields["size"] = json!(size);
    }
    artifact(fields)
}

/// A published file nobody gives a hash for: read once, here, to have one.
fn read_and_pinned(
    path: &str,
    url: &str,
    missing: impl FnOnce() -> ServerError,
) -> Result<BuildArtifact, ServerError> {
    let pinned = pin_url(url, &[]).map_err(|e| match e {
        PinError::Status { status: 404, .. } => missing(),
        other => other.into(),
    })?;
    Ok(published(
        path,
        url,
        Some(pinned.size),
        ("sha256", &pinned.sha256),
    ))
}

fn own(path: &str, source: &JarSource) -> Result<BuildArtifact, ServerError> {
    match source {
        JarSource::Link(url) => {
            let pinned = pin_url(url, &[])?;
            Ok(published(
                path,
                url,
                Some(pinned.size),
                ("sha256", &pinned.sha256),
            ))
        }
        // Not opened here: the merge reads it, and names it then.
        JarSource::File(file) => Ok(BuildArtifact::file(path, file)),
    }
}

fn starter() -> BuildArtifact {
    published(
        JAR_PATH,
        STARTER_URL,
        Some(STARTER_SIZE),
        ("sha256", STARTER_SHA256),
    )
}

fn words(words: &[&str]) -> Vec<String> {
    words.iter().map(|word| (*word).to_owned()).collect()
}

/// A server that is its jar.
fn by_jar(label: String, files: Vec<BuildArtifact>, pinned: ServerCore) -> ResolvedServer {
    ResolvedServer {
        pinned,
        label,
        files,
        vars: ValDefs::new(),
        start: words(&["-jar", JAR_PATH]),
    }
}

/// A server an installer puts together, started through the starter. Its
/// own flag goes with it, so that a pack that moves to a newer build has the
/// newer installer run.
fn by_starter(label: String, installer: BuildArtifact, pinned: ServerCore) -> ResolvedServer {
    ResolvedServer {
        pinned,
        label,
        files: vec![starter(), installer],
        vars: ValDefs::new(),
        start: words(&["-jar", JAR_PATH, REINSTALL]),
    }
}

// ── vanilla ───────────────────────────────────────────────────────────────

fn vanilla_versions(apis: &Apis) -> Result<Vec<String>, ServerError> {
    let manifest = fetch_version_manifest(apis.mojang.as_deref())?;
    Ok(manifest
        .versions
        .into_iter()
        .filter(|version| version.kind == "release")
        .map(|version| version.id)
        .collect())
}

fn vanilla(version: Option<&str>, apis: &Apis) -> Result<ResolvedServer, ServerError> {
    let (_, client) = fetch_client(version, apis.mojang.as_deref())?;
    let server = client
        .downloads
        .server
        .ok_or_else(|| ServerError::NoServer(client.id.clone()))?;
    Ok(by_jar(
        format!("Minecraft {}", client.id),
        vec![published(
            JAR_PATH,
            &server.url,
            Some(server.size),
            ("sha1", &server.sha1),
        )],
        ServerCore::Vanilla {
            version: Some(client.id),
        },
    ))
}

// ── Paper ─────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct PaperProject {
    /// Grouped by release line, newest line and newest version first.
    versions: IndexMap<String, Vec<String>>,
}

#[derive(Deserialize)]
struct PaperBuild {
    id: u64,
    #[serde(default)]
    channel: String,
    /// Keyed by kind. The server itself is `server:default`.
    #[serde(default)]
    downloads: IndexMap<String, PaperDownload>,
}

#[derive(Deserialize)]
struct PaperDownload {
    url: String,
    size: u64,
    checksums: PaperChecksums,
}

#[derive(Deserialize)]
struct PaperChecksums {
    sha256: String,
}

const PAPER_SERVER: &str = "server:default";

fn paper_versions(apis: &Apis) -> Result<Vec<String>, ServerError> {
    let project: PaperProject = get_json(
        &format!("{}/v3/projects/paper", base(&apis.paper, PAPER_API)),
        &[],
    )?;
    Ok(project
        .versions
        .into_values()
        .flatten()
        .filter(|id| stable(id))
        .collect())
}

/// Paper's builds for a version, newest first, as it sends them.
fn paper_all(version: &str, apis: &Apis) -> Result<Vec<PaperBuild>, ServerError> {
    let url = format!(
        "{}/v3/projects/paper/versions/{version}/builds",
        base(&apis.paper, PAPER_API)
    );
    found(get_json(&url, &[]), || {
        none_such(Core::Paper, version, None)
    })
}

/// The stable builds, or all of them for a version that has none yet.
fn paper_offered(builds: Vec<PaperBuild>) -> Vec<PaperBuild> {
    if builds.iter().any(|build| build.channel == "STABLE") {
        builds
            .into_iter()
            .filter(|build| build.channel == "STABLE")
            .collect()
    } else {
        builds
    }
}

fn paper(version: &str, build: Option<&str>, apis: &Apis) -> Result<ResolvedServer, ServerError> {
    let missing = || none_such(Core::Paper, version, build);
    let builds = paper_all(version, apis)?;
    let mut chosen = match build {
        Some(asked) => builds
            .into_iter()
            .find(|build| build.id.to_string() == asked),
        None => paper_offered(builds).into_iter().next(),
    }
    .ok_or_else(missing)?;
    let jar = chosen
        .downloads
        .shift_remove(PAPER_SERVER)
        .ok_or_else(missing)?;
    Ok(by_jar(
        format!("Paper {version} build {}", chosen.id),
        vec![published(
            JAR_PATH,
            &jar.url,
            Some(jar.size),
            ("sha256", &jar.checksums.sha256),
        )],
        ServerCore::Paper {
            version: version.to_owned(),
            build: Some(chosen.id.to_string()),
        },
    ))
}

// ── Purpur ────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct PurpurProject {
    /// Oldest first.
    versions: Vec<String>,
}

#[derive(Deserialize)]
struct PurpurVersion {
    builds: PurpurBuilds,
}

#[derive(Deserialize)]
struct PurpurBuilds {
    /// Oldest first.
    all: Vec<String>,
}

#[derive(Deserialize)]
struct PurpurBuild {
    build: String,
    /// The one hash Purpur publishes. It is weaker than the others a
    /// manifest holds and is still the publisher's own word for the file,
    /// which reading 50 MB on every build would not improve on.
    md5: String,
}

fn purpur_versions(apis: &Apis) -> Result<Vec<String>, ServerError> {
    let project: PurpurProject = get_json(
        &format!("{}/v2/purpur", base(&apis.purpur, PURPUR_API)),
        &[],
    )?;
    Ok(newest_first(project.versions)
        .into_iter()
        .filter(|id| stable(id))
        .collect())
}

fn purpur_builds(version: &str, apis: &Apis) -> Result<Vec<String>, ServerError> {
    let url = format!("{}/v2/purpur/{version}", base(&apis.purpur, PURPUR_API));
    let listed: PurpurVersion = found(get_json(&url, &[]), || {
        none_such(Core::Purpur, version, None)
    })?;
    Ok(newest_first(listed.builds.all))
}

fn purpur(version: &str, build: Option<&str>, apis: &Apis) -> Result<ResolvedServer, ServerError> {
    let api = base(&apis.purpur, PURPUR_API);
    let which = build.unwrap_or("latest");
    let found: PurpurBuild = found(
        get_json(&format!("{api}/v2/purpur/{version}/{which}"), &[]),
        || none_such(Core::Purpur, version, build),
    )?;
    let url = format!("{api}/v2/purpur/{version}/{}/download", found.build);
    Ok(by_jar(
        format!("Purpur {version} build {}", found.build),
        vec![published(JAR_PATH, &url, None, ("md5", &found.md5))],
        ServerCore::Purpur {
            version: version.to_owned(),
            build: Some(found.build),
        },
    ))
}

// ── Fabric ────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct FabricLoaderEntry {
    loader: FabricVersion,
}

/// One entry of any list Fabric sends: newest first, each marked.
#[derive(Deserialize)]
struct FabricVersion {
    version: String,
    stable: bool,
}

/// The stable entries, or all of them where none is stable yet.
fn fabric_offered(versions: Vec<FabricVersion>) -> Vec<String> {
    let any_stable = versions.iter().any(|v| v.stable);
    versions
        .into_iter()
        .filter(|v| v.stable || !any_stable)
        .map(|v| v.version)
        .collect()
}

fn fabric_versions(apis: &Apis) -> Result<Vec<String>, ServerError> {
    let api = base(&apis.fabric, FABRIC_META);
    Ok(fabric_offered(get_json(
        &format!("{api}/v2/versions/game"),
        &[],
    )?))
}

/// Every loader for a version, newest first. Fabric marks only its current
/// loader stable, so keeping to those would make this a list of one; which
/// of them is the default is [`fabric_offered`]'s to say, in [`fabric`].
fn fabric_loaders(version: &str, apis: &Apis) -> Result<Vec<FabricVersion>, ServerError> {
    let api = base(&apis.fabric, FABRIC_META);
    let listed: Vec<FabricLoaderEntry> =
        get_json(&format!("{api}/v2/versions/loader/{version}"), &[])?;
    Ok(listed.into_iter().map(|entry| entry.loader).collect())
}

fn fabric(version: &str, loader: Option<&str>, apis: &Apis) -> Result<ResolvedServer, ServerError> {
    let api = base(&apis.fabric, FABRIC_META);
    let loader = match loader {
        Some(loader) => loader.to_owned(),
        None => fabric_offered(fabric_loaders(version, apis)?)
            .into_iter()
            .next()
            .ok_or_else(|| none_such(Core::Fabric, version, None))?,
    };
    // Which installer builds the launcher jar is not the author's to pick:
    // the newest stable one, and the hash below pins what it made.
    let installer = fabric_offered(get_json(&format!("{api}/v2/versions/installer"), &[])?)
        .into_iter()
        .next()
        .ok_or_else(|| none_such(Core::Fabric, version, Some(&loader)))?;
    // The jar is made on request and nobody publishes its hash, but the
    // same three versions give the same bytes, so it pins like any file.
    let url = format!("{api}/v2/versions/loader/{version}/{loader}/{installer}/server/jar");
    Ok(by_jar(
        format!("Fabric {version}, loader {loader}"),
        vec![read_and_pinned(JAR_PATH, &url, || {
            none_such(Core::Fabric, version, Some(&loader))
        })?],
        ServerCore::Fabric {
            version: version.to_owned(),
            loader: Some(loader),
        },
    ))
}

// ── Forge ─────────────────────────────────────────────────────────────────

const FORGE_DIR: &str = "net/minecraftforge/forge";

/// Minecraft version → every build for it, `<minecraft>-<build>`, both
/// oldest first.
type ForgeBuilds = IndexMap<String, Vec<String>>;

#[derive(Deserialize)]
struct ForgePromotions {
    /// `<minecraft>-recommended` and `<minecraft>-latest` → a build.
    promos: IndexMap<String, String>,
}

fn forge_listed(apis: &Apis) -> Result<ForgeBuilds, ServerError> {
    let files = base(&apis.forge, FORGE_FILES);
    Ok(get_json(
        &format!("{files}/{FORGE_DIR}/maven-metadata.json"),
        &[],
    )?)
}

fn forge_versions(apis: &Apis) -> Result<Vec<String>, ServerError> {
    Ok(newest_first(forge_listed(apis)?.into_keys().collect()))
}

fn forge_builds(version: &str, apis: &Apis) -> Result<Vec<String>, ServerError> {
    let builds = forge_listed(apis)?
        .shift_remove(version)
        .ok_or_else(|| none_such(Core::Forge, version, None))?;
    let prefix = format!("{version}-");
    Ok(newest_first(builds)
        .into_iter()
        .map(|id| id.strip_prefix(&prefix).unwrap_or(&id).to_owned())
        .collect())
}

/// The build Forge recommends for a version, or its newest where it
/// recommends none: what its own download page offers first.
fn forge_promoted(version: &str, apis: &Apis) -> Result<String, ServerError> {
    let files = base(&apis.forge, FORGE_FILES);
    let mut promotions: ForgePromotions =
        get_json(&format!("{files}/{FORGE_DIR}/promotions_slim.json"), &[])?;
    ["recommended", "latest"]
        .iter()
        .find_map(|kind| promotions.promos.shift_remove(&format!("{version}-{kind}")))
        .ok_or_else(|| none_such(Core::Forge, version, None))
}

fn forge(version: &str, build: Option<&str>, apis: &Apis) -> Result<ResolvedServer, ServerError> {
    if predates_starter(version) {
        return Err(ServerError::ForgeTooOld(version.to_owned()));
    }
    let build = match build {
        Some(build) => build.to_owned(),
        None => forge_promoted(version, apis)?,
    };
    let maven = base(&apis.forge_maven, FORGE_MAVEN);
    let id = format!("{version}-{build}");
    let url = format!("{maven}/{FORGE_DIR}/{id}/forge-{id}-installer.jar");
    let installer = read_and_pinned(INSTALLER_PATH, &url, || {
        none_such(Core::Forge, version, Some(&build))
    })?;
    Ok(by_starter(
        format!("Forge {id}"),
        installer,
        ServerCore::Forge {
            version: version.to_owned(),
            build: Some(build),
        },
    ))
}

// ── NeoForge ──────────────────────────────────────────────────────────────

const NEOFORGE_DIR: &str = "net/neoforged/neoforge";

#[derive(Deserialize)]
struct MavenVersions {
    /// Oldest first.
    versions: Vec<String>,
}

fn neoforge_versions(apis: &Apis) -> Result<Vec<String>, ServerError> {
    let maven = base(&apis.neoforge, NEOFORGE_MAVEN);
    let listed: MavenVersions = get_json(
        &format!("{maven}/api/maven/versions/releases/{NEOFORGE_DIR}"),
        &[],
    )?;
    Ok(newest_first(listed.versions)
        .into_iter()
        .filter(|id| stable(id))
        .collect())
}

fn neoforge(version: &str, apis: &Apis) -> Result<ResolvedServer, ServerError> {
    let maven = base(&apis.neoforge, NEOFORGE_MAVEN);
    let url = format!("{maven}/releases/{NEOFORGE_DIR}/{version}/neoforge-{version}-installer.jar");
    Ok(by_starter(
        format!("NeoForge {version}"),
        read_and_pinned(INSTALLER_PATH, &url, || {
            none_such(Core::Neoforge, version, None)
        })?,
        ServerCore::Neoforge {
            version: version.to_owned(),
        },
    ))
}

// ── Cleanroom ─────────────────────────────────────────────────────────────

/// FML's tweaker for a dedicated server. The document is the client's and
/// names the client's one among its game arguments; the installer writes
/// this in its place, and every release has had it.
/// What a config writes for Cleanroom's newest release.
const LATEST: &str = "latest";

const CLEANROOM_SERVER_TWEAKER: &str = "net.minecraftforge.fml.common.launcher.FMLServerTweaker";

/// Cleanroom's installer patches nothing: in server mode it downloads the
/// document's libraries and Mojang's server jar and writes an argument file
/// that starts them. So nothing is left for the server's machine to do, and
/// this is what the installer would have laid out, every file pinned, and
/// the line its argument file holds. No installer and no starter.
///
/// The document is the one the `cleanroom` plugin reads, through the same
/// crate. Its natives are dropped, being the game window's and sound's, and
/// so is everything a client has beside its libraries.
fn cleanroom_releases(apis: &Apis) -> Result<Vec<CleanroomRelease>, ServerError> {
    Ok(list_cleanroom_releases(base(
        &apis.cleanroom,
        DEFAULT_CLEANROOM_INDEX,
    ))?)
}

/// A release by its tag, or `latest`, the newest. Never by a Minecraft
/// version, which the `cleanroom` plugin also takes: Cleanroom is 1.12.2
/// and nothing else, so naming it chooses nothing.
fn cleanroom(version: &str, apis: &Apis) -> Result<ResolvedServer, ServerError> {
    let releases = cleanroom_releases(apis)?;
    let release = if version == LATEST {
        releases.into_iter().next()
    } else {
        releases
            .into_iter()
            .find(|release| release.cleanroom == version)
    }
    .ok_or_else(|| none_such(Core::Cleanroom, version, None))?;
    let document = fetch_document(&release.document_url)?;
    let minecraft = &release.minecraft;
    let server = document
        .downloads
        .server
        .as_ref()
        .ok_or_else(|| ServerError::NoServer(minecraft.clone()))?;

    // Where the installer puts it, and last on the classpath, as a client
    // jar goes: Cleanroom's own copies of its classes only win from ahead.
    let jar =
        format!("${{library_directory}}/net/minecraft/server/{minecraft}/server-{minecraft}.jar");
    let libraries: Vec<_> = document.libraries.iter().filter(|l| !l.native).collect();
    let entries: Vec<ClasspathEntry> = libraries.iter().map(|l| ClasspathEntry::of(l)).collect();
    let classpath = classpath_of(&classpath_entries(&entries, &jar))?;

    let mut files = vec![published(
        &jar,
        &server.url,
        Some(server.size),
        ("sha1", &server.sha1),
    )];
    files.extend(
        libraries
            .iter()
            .map(|library| BuildArtifact::from(library_to_artifact(library))),
    );

    let mut vars = ValDefs::new();
    vars.insert(
        "library_directory".to_owned(),
        ValDef::Flat("${root}/libraries".to_owned()),
    );
    let separator = |value: &str, os: OsName| ConditionalVal {
        value: value.to_owned(),
        rules: allow_os_ruleset(os),
    };
    vars.insert(
        "classpath_separator".to_owned(),
        ValDef::Arms(vec![
            separator(";", OsName::Windows),
            separator(":", OsName::Linux),
            separator(":", OsName::Osx),
        ]),
    );
    vars.insert("classpath".to_owned(), ValDef::Arms(classpath));

    Ok(ResolvedServer {
        label: format!("Cleanroom {} for Minecraft {minecraft}", release.cleanroom),
        files,
        vars,
        start: vec![
            "-cp".to_owned(),
            "${classpath}".to_owned(),
            document.main_class.clone(),
            "--tweakClass".to_owned(),
            CLEANROOM_SERVER_TWEAKER.to_owned(),
        ],
        pinned: ServerCore::Cleanroom {
            version: release.cleanroom,
        },
    })
}

// ── the three questions ───────────────────────────────────────────────────

/// The versions a core has a server for, newest first. They are Minecraft
/// versions for every core but NeoForge and Cleanroom, whose own version
/// names a build. Cleanroom's are all of them: it calls every release it
/// has made an alpha.
pub fn list_versions(core: Core, apis: &Apis) -> Result<Vec<String>, ServerError> {
    match core {
        Core::Vanilla => vanilla_versions(apis),
        Core::Paper => paper_versions(apis),
        Core::Purpur => purpur_versions(apis),
        Core::Fabric => fabric_versions(apis),
        Core::Forge => forge_versions(apis),
        Core::Neoforge => neoforge_versions(apis),
        Core::Cleanroom => Ok(cleanroom_releases(apis)?
            .into_iter()
            .map(|release| release.cleanroom)
            .collect()),
    }
}

/// The builds a core has of one version, newest first: build numbers, or
/// for Fabric its loaders. Empty for a core whose version is all there is
/// to choose, Mojang's, NeoForge's and Cleanroom's.
pub fn list_builds(core: Core, version: &str, apis: &Apis) -> Result<Vec<String>, ServerError> {
    match core {
        Core::Vanilla | Core::Neoforge | Core::Cleanroom => Ok(Vec::new()),
        Core::Paper => Ok(paper_offered(paper_all(version, apis)?)
            .into_iter()
            .map(|build| build.id.to_string())
            .collect()),
        Core::Purpur => purpur_builds(version, apis),
        Core::Fabric => Ok(fabric_loaders(version, apis)?
            .into_iter()
            .map(|loader| loader.version)
            .collect()),
        Core::Forge => forge_builds(version, apis),
    }
}

/// What a config resolves to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ResolvedServer {
    /// The core with nothing left to "the newest": what to write in a
    /// config to get this server again.
    pub pinned: ServerCore,
    /// What it is, for the build log: `Paper 1.21.1 build 133`.
    pub label: String,
    /// The server's own files, the jar first.
    pub files: Vec<BuildArtifact>,
    /// What the launch line below reads, where it reads more than `root`.
    /// How a server starts is its contribution's to say, and is not part
    /// of what a config resolves to.
    #[serde(skip)]
    pub vars: ValDefs,
    /// The words that start it, between the `java` and `nogui`.
    #[serde(skip)]
    pub start: Vec<String>,
}

/// Resolve what a config asked for, down to the files.
pub fn resolve_server(options: &ServerOptions) -> Result<ResolvedServer, ServerError> {
    let apis = &options.apis;
    match &options.core {
        ServerCore::Vanilla { version } => vanilla(version.as_deref(), apis),
        ServerCore::Paper { version, build } => paper(version, build.as_deref(), apis),
        ServerCore::Purpur { version, build } => purpur(version, build.as_deref(), apis),
        ServerCore::Fabric { version, loader } => fabric(version, loader.as_deref(), apis),
        ServerCore::Forge { version, build } => forge(version, build.as_deref(), apis),
        ServerCore::Neoforge { version } => neoforge(version, apis),
        ServerCore::Cleanroom { version } => cleanroom(version, apis),
        ServerCore::Jar(jar) => Ok(by_jar(
            format!("a jar from {}", written(jar)),
            vec![own(JAR_PATH, jar)?],
            options.core.clone(),
        )),
        ServerCore::Installer(installer) => Ok(by_starter(
            format!("an installer from {}", written(installer)),
            own(INSTALLER_PATH, installer)?,
            options.core.clone(),
        )),
    }
}

fn written(source: &JarSource) -> String {
    match source {
        JarSource::Link(url) => url.clone(),
        JarSource::File(path) => path.display().to_string(),
    }
}
