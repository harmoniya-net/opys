use std::collections::HashSet;

use opys_core::{allow_os_ruleset, satisfies_ruleset, ConditionalVal, Launch, MojangRuleset, Val};
use opys_mojang::{ArgValue, MojangArgValue};
use opys_mojang_rules::{OsName, OsOptions, RuleError};
use serde::{Deserialize, Serialize};

/// One classpath candidate: where the jar lands, and the rules that decide
/// whether it lands at all. Loaders build these from their own library sets —
/// forge prepends its runtime libs to vanilla's — which is why the input is
/// this triple rather than a `Library`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClasspathEntry {
    #[serde(default)]
    pub rules: MojangRuleset,
    pub artifact_path: String,
    /// `group:artifact` — the module this entry provides, when providing it
    /// twice would be wrong. [`inherited_classpath`] drops a base entry whose
    /// module a patch entry also names: a loader that ships its own ASM means
    /// to replace vanilla's, not to sit in front of it.
    ///
    /// `None` opts out, and natives always opt out. A pre-1.19 version JSON
    /// declares its natives inside the library that needs them, so they
    /// expand into entries carrying that library's coordinate verbatim —
    /// keying on it would let one patch library delete a whole per-OS set.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub module: Option<String>,
}

impl ClasspathEntry {
    /// The entry a [`Library`] contributes.
    ///
    /// [`Library`]: opys_mojang::Library
    pub fn of(library: &opys_mojang::Library) -> Self {
        ClasspathEntry {
            rules: library.rules.clone(),
            artifact_path: format!("${{library_directory}}/{}", library.artifact.path),
            module: (!library.native).then(|| {
                format!("{}:{}", library.name.group_id, library.name.artifact_id)
            }),
        }
    }
}

/// Decomposed parts of a Minecraft [`Launch`]. `launch` is the assembled
/// value (drop straight into `manifest.launch`); the rest expose the JVM args,
/// main class and game args separately so callers can interleave their own JVM
/// args — an auth `-javaagent`, say — before the main class.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchParts {
    pub launch: Launch,
    pub jvm_args: Vec<Val>,
    pub main_class: Val,
    pub game_args: Vec<Val>,
}

/// The three OSes a classpath is computed for.
const OSES: [OsName; 3] = [OsName::Linux, OsName::Windows, OsName::Osx];

fn os_str(os: OsName) -> &'static str {
    match os {
        OsName::Linux => "linux",
        OsName::Windows => "windows",
        OsName::Osx => "osx",
    }
}

/// Build the `${classpath}` arms — one per OS.
///
/// The client jar goes **last**, after every library. That is where every
/// launcher that reads this format puts it — verified against HMCL
/// (`DefaultLauncher`: libraries into a `LinkedHashSet`, then the jar) and
/// `minecraft-launcher-lib` (`get_libraries`: the loop, then the jar). It
/// matters wherever a library and the client jar carry the same class: the
/// library is the patched copy, and it only wins by being ahead.
///
/// Minecraft / forge / cleanroom library `rules` gate on OS only, never
/// `arch` (verified across version JSONs 1.7.10–1.21.4 — the only arch
/// dimension Mojang ever used is the legacy `natives`-map `${arch}`
/// substitution, handled separately). So the classpath is computed once per
/// OS; the `arch` below is a fixed placeholder, required solely because
/// `OsOptions` mandates the field. If an `os.arch` rule ever appears in a
/// version JSON, this must become per-(os, arch).
///
/// The only way this fails is an `os.version` pattern that is not a valid
/// regex — a defect in the version JSON, reported rather than silently
/// dropping the library off that OS's classpath.
pub fn build_classpath(
    libs: &[ClasspathEntry],
    client_jar_path: &str,
) -> Result<Vec<ConditionalVal>, RuleError> {
    OSES.iter()
        .map(|&name| {
            let os = OsOptions {
                name: os_str(name).to_owned(),
                version: String::new(),
                arch: "x86_64".to_owned(),
            };
            let mut parts = Vec::new();
            for lib in libs {
                if satisfies_ruleset(&lib.rules, &os, &[])? {
                    parts.push(lib.artifact_path.clone());
                }
            }
            parts.push(client_jar_path.to_owned());
            Ok(ConditionalVal {
                value: parts.join("${classpath_separator}"),
                rules: allow_os_ruleset(name),
            })
        })
        .collect()
}

/// The base entries an `inheritsFrom` patch supersedes: those naming a module
/// the patch also names.
///
/// Split out from [`inherited_classpath`] because the *artifact* set has to
/// agree with the classpath — a jar dropped from `-cp` should not still be
/// downloaded — and the caller is what holds the artifacts.
pub fn superseded(patch: &[ClasspathEntry], base: &[ClasspathEntry]) -> Vec<String> {
    let replaced: HashSet<&str> = patch.iter().filter_map(|e| e.module.as_deref()).collect();
    base.iter()
        .filter(|e| e.module.as_deref().is_some_and(|m| replaced.contains(m)))
        .map(|e| e.artifact_path.clone())
        .collect()
}

/// Build the `${classpath}` arms for an `inheritsFrom` document.
///
/// The patch's own libraries come first, then the base version's. That is not
/// a preference: it is what `inheritsFrom` means, verified against two
/// independent readers of the format — HMCL merges as
/// `Lang.merge(this.libraries, parent.libraries)`, and
/// `minecraft-launcher-lib`'s `inherit_json` starts from the child's list and
/// appends the parent's.
///
/// A base entry naming a module the patch also names is dropped rather than
/// left behind the patch's copy. Order alone would already decide which class
/// the JVM loads, but a second copy of a library the loader deliberately
/// replaced is still wrong: it is downloaded, verified and put on `-cp` to be
/// ignored, and something that scans the classpath itself — BootstrapLauncher's
/// ignore list, a coremod's discovery — can still find it.
/// `minecraft-launcher-lib` does the same, keyed the same way.
///
/// Entries with no module — natives, and anything a caller declines to key —
/// are never dropped. See [`ClasspathEntry::module`] for why natives must not
/// participate.
pub fn inherited_classpath(
    patch: &[ClasspathEntry],
    base: &[ClasspathEntry],
    client_jar_path: &str,
) -> Result<Vec<ConditionalVal>, RuleError> {
    let replaced: HashSet<&str> = patch.iter().filter_map(|e| e.module.as_deref()).collect();
    let entries: Vec<ClasspathEntry> = patch
        .iter()
        .chain(
            base.iter()
                .filter(|e| !e.module.as_deref().is_some_and(|m| replaced.contains(m))),
        )
        .cloned()
        .collect();
    build_classpath(&entries, client_jar_path)
}

/// A Mojang argument as a manifest [`Val`].
fn to_val(arg: &MojangArgValue) -> Val {
    match arg {
        MojangArgValue::Plain(s) => Val {
            rules: Vec::new(),
            value: vec![s.clone()],
        },
        MojangArgValue::Conditional { rules, value } => Val {
            rules: rules.clone(),
            value: match value {
                ArgValue::One(s) => vec![s.clone()],
                ArgValue::Many(v) => v.clone(),
            },
        },
    }
}

pub fn build_launch(
    main_class: &str,
    game_args: &[MojangArgValue],
    jvm_args: &[MojangArgValue],
) -> LaunchParts {
    let jvm: Vec<Val> = jvm_args.iter().map(to_val).collect();
    let game: Vec<Val> = game_args.iter().map(to_val).collect();
    let main = Val {
        rules: Vec::new(),
        value: vec![main_class.to_owned()],
    };

    let launch = Launch {
        command: "${java_bin}".to_owned(),
        workdir: "./".to_owned(),
        args: [jvm.clone(), vec![main.clone()], game.clone()].concat(),
        envs: Default::default(),
    };

    LaunchParts {
        launch,
        jvm_args: jvm,
        main_class: main,
        game_args: game,
    }
}
