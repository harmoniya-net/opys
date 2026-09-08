use opys_core::{allow_os_ruleset, satisfies_ruleset, ConditionalVal, Launch, MojangRuleset, Val};
use opys_mojang::{ArgValue, MojangArgValue};
use opys_mojang_rules::{OsName, OsOptions, RuleError};
use serde::{Deserialize, Serialize};

/// One classpath candidate: where the jar lands, and the rules that decide
/// whether it lands at all. Loaders build these from their own library sets —
/// forge prepends its runtime libs to vanilla's — which is why the input is
/// this pair rather than a `Library`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClasspathEntry {
    #[serde(default)]
    pub rules: MojangRuleset,
    pub artifact_path: String,
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
            let mut parts = vec![client_jar_path.to_owned()];
            for lib in libs {
                if satisfies_ruleset(&lib.rules, &os, &[])? {
                    parts.push(lib.artifact_path.clone());
                }
            }
            Ok(ConditionalVal {
                value: parts.join("${classpath_separator}"),
                rules: allow_os_ruleset(name),
            })
        })
        .collect()
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
