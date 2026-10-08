//! The merge, and the launch line's references. Ported at first from
//! `packages/dev/tests/unit/engine.test.ts`; the references were added here,
//! since resolving them is this crate's.

use opys_core::{
    blob_id, Artifact, BlobSource, Blobs, CleanupRule, ConditionalVal, Source, Val, ValDef, ValDefs,
};
use opys_dev::{
    assemble as try_assemble, AssembleError, Assembled, Contribution, LaunchFragment,
    ManifestConfig, PluginOutput,
};

fn assemble(outputs: &[PluginOutput], config: &ManifestConfig) -> Assembled {
    try_assemble(outputs, config).expect("the config assembles")
}

fn artifact(path: &str, url: &str) -> Artifact {
    Artifact {
        path: path.to_owned(),
        source: Source::Url {
            url: url.to_owned(),
        },
        size: None,
        rules: Vec::new(),
        integrity: None,
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
fn accepts_a_literal_envs_map_and_emits_cleanup() {
    let out = assemble(
        &[],
        &ManifestConfig {
            envs: flat(&[("KEY", "val")]),
            cleanup: vec![CleanupRule {
                includes: vec!["mods/**".to_owned()],
                excludes: Vec::new(),
            }],
            ..config()
        },
    );

    assert_eq!(out.manifest.launch.unwrap().envs, flat(&[("KEY", "val")]));
    assert_eq!(out.manifest.cleanup[0].includes, ["mods/**"]);
}

#[test]
fn omits_cleanup_when_the_config_provides_no_rules() {
    let out = assemble(&[], &config());

    assert!(out.manifest.cleanup.is_empty());
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

// ── blobs ─────────────────────────────────────────────────────────────────

fn held(content: &str) -> (String, BlobSource) {
    (
        blob_id(content.as_bytes()),
        BlobSource::Bytes(content.into()),
    )
}

#[test]
fn a_plugins_blobs_travel_with_the_artifacts_that_name_them() {
    let (a, a_bytes) = held("a");
    let (b, b_bytes) = held("b");
    let assembled = assemble(
        &[
            plugin(
                "one",
                Contribution {
                    artifacts: vec![Artifact::blob("a.txt", &a, 1)],
                    blobs: Blobs::from([(a.clone(), a_bytes.clone())]),
                    ..Default::default()
                },
            ),
            plugin(
                "two",
                Contribution {
                    artifacts: vec![
                        Artifact::blob("b.txt", &b, 1),
                        artifact("c.jar", "https://x/c.jar"),
                    ],
                    blobs: Blobs::from([(b.clone(), b_bytes.clone())]),
                    ..Default::default()
                },
            ),
        ],
        &config(),
    );
    assert_eq!(assembled.blobs, Blobs::from([(a, a_bytes), (b, b_bytes)]));
    assert!(assembled.warnings.is_empty());
}

#[test]
fn a_blob_whose_artifact_was_replaced_is_dropped_with_it() {
    let (old, old_bytes) = held("old");
    let (new, new_bytes) = held("new");
    let assembled = assemble(
        &[
            plugin(
                "one",
                Contribution {
                    artifacts: vec![Artifact::blob("config.toml", &old, 3)],
                    blobs: Blobs::from([(old, old_bytes)]),
                    ..Default::default()
                },
            ),
            plugin(
                "two",
                Contribution {
                    artifacts: vec![Artifact::blob("config.toml", &new, 3)],
                    blobs: Blobs::from([(new.clone(), new_bytes.clone())]),
                    ..Default::default()
                },
            ),
        ],
        &config(),
    );
    assert_eq!(assembled.manifest.artifacts.len(), 1);
    assert_eq!(assembled.blobs, Blobs::from([(new, new_bytes)]));
}

#[test]
fn two_plugins_holding_the_same_blob_is_not_a_collision() {
    let (id, bytes) = held("shared");
    let contribution = |path: &str| Contribution {
        artifacts: vec![Artifact::blob(path, &id, 6)],
        blobs: Blobs::from([(id.clone(), bytes.clone())]),
        ..Default::default()
    };
    let assembled = assemble(
        &[
            plugin("one", contribution("a")),
            plugin("two", contribution("b")),
        ],
        &config(),
    );
    assert_eq!(assembled.blobs.len(), 1);
    assert!(assembled.warnings.is_empty());
}

#[test]
fn a_contribution_reads_its_blobs_off_the_wire() {
    let (id, _) = held("hello");
    let output: PluginOutput = serde_json::from_value(serde_json::json!({
        "name": "files",
        "contribution": {
            "artifacts": [{ "path": "a.txt", "source": { "blob": id } }],
            "blobs": { id.clone(): { "file": "/srv/build/a.txt" } },
        },
    }))
    .unwrap();
    assert_eq!(
        output.contribution.blobs,
        Blobs::from([(id, BlobSource::File("/srv/build/a.txt".into()))])
    );
}

/// A loader and a JDK, as the launch line sees them.
fn launchers() -> Vec<PluginOutput> {
    let groups = |pairs: Vec<(&str, LaunchFragment)>| Contribution {
        launch: pairs.into_iter().map(|(k, v)| (k.to_owned(), v)).collect(),
        ..Default::default()
    };
    vec![
        plugin(
            "forge",
            groups(vec![
                (
                    "jvmArgs",
                    LaunchFragment::Many(vec![val("-Xss1M"), val("-cp")]),
                ),
                ("mainClass", LaunchFragment::One(val("Main"))),
                ("dir", LaunchFragment::Text("${game_directory}".to_owned())),
            ]),
        ),
        plugin(
            "java",
            groups(vec![(
                "bin",
                LaunchFragment::Text("${java_bin}".to_owned()),
            )]),
        ),
    ]
}

fn text(s: &str) -> LaunchFragment {
    LaunchFragment::Text(s.to_owned())
}

fn args_of(out: &Assembled) -> Vec<String> {
    out.manifest
        .launch
        .as_ref()
        .expect("a launch")
        .args
        .iter()
        .flat_map(|v| v.value.clone())
        .collect()
}

#[test]
fn a_reference_is_replaced_by_the_group_it_names_in_the_order_written() {
    let out = assemble(
        &launchers(),
        &ManifestConfig {
            command: "@java.bin".to_owned(),
            workdir: Some("@forge.dir".to_owned()),
            args: vec![
                text("@forge.jvmArgs"),
                text("-Xmx4G"),
                text("@forge.mainClass"),
            ],
            ..Default::default()
        },
    );
    let launch = out.manifest.launch.as_ref().expect("a launch");
    assert_eq!(launch.command, "${java_bin}");
    assert_eq!(launch.workdir, "${game_directory}");
    assert_eq!(args_of(&out), ["-Xss1M", "-cp", "-Xmx4G", "Main"]);
}

#[test]
fn a_backslash_makes_an_at_sign_literal_and_is_dropped() {
    let out = assemble(
        &launchers(),
        &ManifestConfig {
            command: "java".to_owned(),
            args: vec![text("\\@jvm.args"), text("\\n"), text("a@b.c")],
            ..Default::default()
        },
    );
    // Only `\@` at the start is an escape; nothing else about a string is read.
    assert_eq!(args_of(&out), ["@jvm.args", "\\n", "a@b.c"]);
}

#[test]
fn a_value_written_out_in_full_is_never_read_for_a_reference() {
    let out = assemble(
        &launchers(),
        &ManifestConfig {
            command: "java".to_owned(),
            args: vec![LaunchFragment::One(val("@forge.jvmArgs"))],
            ..Default::default()
        },
    );
    assert_eq!(args_of(&out), ["@forge.jvmArgs"]);
}

fn refused(config: ManifestConfig) -> AssembleError {
    try_assemble(&launchers(), &config).expect_err("the config is refused")
}

#[test]
fn a_reference_to_a_plugin_that_is_not_there_lists_the_ones_that_are() {
    let error = refused(ManifestConfig {
        command: "java".to_owned(),
        args: vec![text("@fabric.jvmArgs")],
        ..Default::default()
    });
    assert_eq!(
        error.to_string(),
        "'@fabric.jvmArgs': there is no plugin named 'fabric' (there are: forge, java)"
    );
}

#[test]
fn a_reference_to_a_group_a_plugin_does_not_expose_lists_what_it_has() {
    let error = refused(ManifestConfig {
        command: "java".to_owned(),
        args: vec![text("@forge.jvmArg")],
        ..Default::default()
    });
    assert_eq!(
        error.to_string(),
        "'@forge.jvmArg': 'forge' exposes no 'jvmArg' (it has: dir, jvmArgs, mainClass)"
    );
}

#[test]
fn a_reference_with_no_group_is_not_one() {
    for bad in ["@forge", "@forge.", "@.bin", "@"] {
        let error = refused(ManifestConfig {
            command: bad.to_owned(),
            ..Default::default()
        });
        assert_eq!(
            error,
            AssembleError::BadReference {
                reference: bad.to_owned()
            }
        );
    }
}

#[test]
fn a_command_cannot_be_a_list() {
    let error = refused(ManifestConfig {
        command: "@forge.jvmArgs".to_owned(),
        ..Default::default()
    });
    assert_eq!(
        error,
        AssembleError::NotOneString {
            field: "command",
            reference: "@forge.jvmArgs".to_owned()
        }
    );
    // One value with no rules is one string, whichever way it was exposed.
    let out = assemble(
        &launchers(),
        &ManifestConfig {
            command: "@forge.mainClass".to_owned(),
            ..Default::default()
        },
    );
    assert_eq!(out.manifest.launch.expect("a launch").command, "Main");
}

#[test]
fn two_plugins_of_one_name_are_refused_whether_or_not_anything_names_them() {
    let outputs = vec![
        plugin("files", Contribution::default()),
        plugin("files", Contribution::default()),
    ];
    assert_eq!(
        try_assemble(&outputs, &config()).expect_err("refused"),
        AssembleError::DuplicatePlugin {
            name: "files".to_owned()
        }
    );
}

#[test]
fn a_plugin_name_with_a_dot_in_it_can_still_be_named() {
    let outputs = vec![plugin(
        "my.java",
        Contribution {
            launch: [("bin".to_owned(), text("/usr/bin/java"))]
                .into_iter()
                .collect(),
            ..Default::default()
        },
    )];
    let out = assemble(
        &outputs,
        &ManifestConfig {
            command: "@my.java.bin".to_owned(),
            ..Default::default()
        },
    );
    assert_eq!(
        out.manifest.launch.expect("a launch").command,
        "/usr/bin/java"
    );
}
