//! Ported from `packages/dev/tests/unit/engine.test.ts`.
//!
//! The two JS cases that fed `workdir` / `envs` through accessor *functions*
//! have no counterpart here: the engine receives those already applied, so
//! what they covered is the caller's plumbing, not the merge.

use opys_core::{Artifact, ConditionalVal, Source, Val, ValDef, ValDefs};
use opys_dev::{assemble, Contribution, LaunchFragment, ManifestConfig, PluginOutput};

fn artifact(path: &str, url: &str) -> Artifact {
    Artifact {
        path: path.to_owned(),
        source: Source::Url {
            url: url.to_owned(),
        },
        size: None,
        rules: Vec::new(),
        integrity: None,
        discovery: None,
        metadata: None,
        extract: None,
    }
}

fn flat(pairs: &[(&str, &str)]) -> ValDefs {
    pairs
        .iter()
        .map(|(k, v)| ((*k).to_owned(), ValDef::Flat((*v).to_owned())))
        .collect()
}

fn val(value: &str) -> Val {
    Val {
        rules: Vec::new(),
        value: vec![value.to_owned()],
    }
}

fn plugin(name: &str, contribution: Contribution) -> PluginOutput {
    PluginOutput {
        name: name.to_owned(),
        contribution,
    }
}

/// `command` is required, so every config starts from this.
fn config() -> ManifestConfig {
    ManifestConfig {
        command: "java".to_owned(),
        ..Default::default()
    }
}

#[test]
fn merges_artifacts_and_vars_and_assembles_launch() {
    let outputs = vec![
        plugin(
            "base",
            Contribution {
                artifacts: vec![artifact("a.jar", "http://x/a")],
                vars: flat(&[("root", ".")]),
                ..Default::default()
            },
        ),
        plugin(
            "extra",
            Contribution {
                artifacts: vec![artifact("b.jar", "http://x/b")],
                ..Default::default()
            },
        ),
    ];
    let out = assemble(
        &outputs,
        &ManifestConfig {
            command: "java".to_owned(),
            workdir: Some("${root}".to_owned()),
            args: vec![
                LaunchFragment::Many(vec![val("-Xmx2G")]),
                LaunchFragment::Text("Main".to_owned()),
            ],
            ..Default::default()
        },
    );

    assert_eq!(out.manifest.artifacts.len(), 2);
    assert_eq!(out.manifest.vars, flat(&[("root", ".")]));
    let launch = out.manifest.launch.unwrap();
    assert_eq!(launch.command, "java");
    assert_eq!(launch.workdir, "${root}");
    assert_eq!(launch.args, vec![val("-Xmx2G"), val("Main")]);
}

#[test]
fn config_vars_override_plugin_vars_and_literal_artifacts_merge() {
    let outputs = vec![plugin(
        "p",
        Contribution {
            vars: flat(&[("root", "plugin")]),
            ..Default::default()
        },
    )];
    let out = assemble(
        &outputs,
        &ManifestConfig {
            vars: flat(&[("root", "override")]),
            artifacts: vec![artifact("lit.jar", "http://x/l")],
            ..config()
        },
    );

    assert_eq!(out.manifest.vars, flat(&[("root", "override")]));
    assert_eq!(out.manifest.artifacts.len(), 1);
    assert_eq!(out.manifest.artifacts[0].path, "lit.jar");
}

#[test]
fn warns_on_plugin_vs_plugin_var_collision() {
    let outputs = vec![
        plugin(
            "a",
            Contribution {
                vars: flat(&[("x", "1")]),
                ..Default::default()
            },
        ),
        plugin(
            "b",
            Contribution {
                vars: flat(&[("x", "2")]),
                ..Default::default()
            },
        ),
    ];
    let out = assemble(&outputs, &config());

    assert!(out.warnings.iter().any(|w| w.contains("var 'x'")));
    assert_eq!(out.manifest.vars, flat(&[("x", "2")]));
}

#[test]
fn does_not_warn_when_a_plugin_resets_its_own_var() {
    let outputs = vec![plugin(
        "a",
        Contribution {
            vars: flat(&[("x", "1")]),
            ..Default::default()
        },
    )];
    let out = assemble(&outputs, &config());

    assert!(out.warnings.is_empty());
}

#[test]
fn flattens_a_bare_val_arg_and_dedupes_artifacts() {
    let outputs = vec![plugin(
        "p",
        Contribution {
            artifacts: vec![
                artifact("same.jar", "http://x/1"),
                artifact("same.jar", "http://x/2"),
            ],
            ..Default::default()
        },
    )];
    let out = assemble(
        &outputs,
        &ManifestConfig {
            args: vec![
                LaunchFragment::One(val("-flag")),
                LaunchFragment::Text("tail".to_owned()),
            ],
            ..config()
        },
    );

    assert_eq!(out.manifest.artifacts.len(), 1);
    assert_eq!(
        out.manifest.artifacts[0].source,
        Source::Url {
            url: "http://x/2".to_owned()
        }
    );
    assert_eq!(
        out.manifest.launch.unwrap().args,
        vec![val("-flag"), val("tail")]
    );
}

#[test]
fn merges_plugin_contributed_envs() {
    let outputs = vec![
        plugin(
            "java",
            Contribution {
                envs: flat(&[("JAVA_HOME", "/jdk")]),
                ..Default::default()
            },
        ),
        plugin(
            "other",
            Contribution {
                envs: flat(&[("OTHER", "1")]),
                ..Default::default()
            },
        ),
    ];
    let out = assemble(&outputs, &config());

    assert_eq!(
        out.manifest.launch.unwrap().envs,
        flat(&[("JAVA_HOME", "/jdk"), ("OTHER", "1")])
    );
}

#[test]
fn manifest_envs_override_a_plugin_contributed_env() {
    let outputs = vec![plugin(
        "java",
        Contribution {
            envs: flat(&[("JAVA_HOME", "/plugin")]),
            ..Default::default()
        },
    )];
    let out = assemble(
        &outputs,
        &ManifestConfig {
            envs: flat(&[("JAVA_HOME", "/override")]),
            ..config()
        },
    );

    assert_eq!(
        out.manifest.launch.unwrap().envs,
        flat(&[("JAVA_HOME", "/override")])
    );
}

#[test]
fn warns_and_keeps_the_last_env_on_collision() {
    let outputs = vec![
        plugin(
            "a",
            Contribution {
                envs: flat(&[("DUP", "first")]),
                ..Default::default()
            },
        ),
        plugin(
            "b",
            Contribution {
                envs: flat(&[("DUP", "second")]),
                ..Default::default()
            },
        ),
    ];
    let out = assemble(&outputs, &config());

    assert_eq!(
        out.manifest.launch.unwrap().envs,
        flat(&[("DUP", "second")])
    );
    assert!(out.warnings.iter().any(|w| w.contains("env 'DUP'")));
}

#[test]
fn defaults_workdir_to_dot_and_envs_to_empty() {
    let out = assemble(&[], &config());
    let launch = out.manifest.launch.unwrap();

    assert_eq!(launch.workdir, ".");
    assert!(launch.envs.is_empty());
}

#[test]
fn accepts_a_literal_envs_map_and_emits_restrict() {
    let out = assemble(
        &[],
        &ManifestConfig {
            envs: flat(&[("KEY", "val")]),
            restrict: vec!["mods/**".to_owned()],
            ..config()
        },
    );

    assert_eq!(out.manifest.launch.unwrap().envs, flat(&[("KEY", "val")]));
    assert_eq!(out.manifest.restrict, Some(vec!["mods/**".to_owned()]));
}

#[test]
fn omits_restrict_when_the_config_provides_an_empty_list() {
    let out = assemble(&[], &config());

    assert_eq!(out.manifest.restrict, None);
}

#[test]
fn wraps_a_var_reference_arg_and_preserves_a_conditional_var() {
    let game_dir = ValDef::Arms(vec![ConditionalVal {
        value: "/home/user/.minecraft".to_owned(),
        rules: Vec::new(),
    }]);
    let out = assemble(
        &[],
        &ManifestConfig {
            args: vec![LaunchFragment::Text("${game_dir}".to_owned())],
            vars: [("game_dir".to_owned(), game_dir.clone())]
                .into_iter()
                .collect(),
            ..config()
        },
    );

    assert_eq!(out.manifest.launch.unwrap().args, vec![val("${game_dir}")]);
    assert_eq!(out.manifest.vars.get("game_dir"), Some(&game_dir));
}

#[test]
fn a_var_reference_arg_and_a_plain_var_coexist() {
    let outputs = vec![plugin(
        "p",
        Contribution {
            vars: flat(&[("root", "/data")]),
            ..Default::default()
        },
    )];
    let out = assemble(
        &outputs,
        &ManifestConfig {
            args: vec![
                LaunchFragment::Text("${root}".to_owned()),
                LaunchFragment::Text("--flag".to_owned()),
            ],
            ..config()
        },
    );

    assert_eq!(out.manifest.vars, flat(&[("root", "/data")]));
    assert_eq!(
        out.manifest.launch.unwrap().args,
        vec![val("${root}"), val("--flag")]
    );
}
