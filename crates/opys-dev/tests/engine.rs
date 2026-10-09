//! The merge, and the launch line's references. Ported at first from
//! `packages/dev/tests/unit/engine.test.ts`; the references were added here,
//! since resolving them is this crate's.

use opys_bundle::{blob_id, BlobSource, Blobs};
use opys_core::{Artifact, CleanupRule, ConditionalVal, Source, Val, ValDef, ValDefs};
use opys_dev::{
    assemble as try_assemble, AssembleError, Assembled, BuildArtifact, Contribution,
    LaunchFragment, ManifestConfig, PluginOutput,
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
                artifacts: vec![artifact("a.jar", "http://x/a").into()],
                vars: flat(&[("root", ".")]),
                ..Default::default()
            },
        ),
        plugin(
            "extra",
            Contribution {
                artifacts: vec![artifact("b.jar", "http://x/b").into()],
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
                artifact("same.jar", "http://x/1").into(),
                artifact("same.jar", "http://x/2").into(),
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

fn carried(path: &str, content: &str) -> BuildArtifact {
    BuildArtifact::bytes(path, content.into())
}

fn held(content: &str) -> (String, BlobSource) {
    (
        blob_id(content.as_bytes()),
        BlobSource::Bytes(content.into()),
    )
}

#[test]
fn a_carried_artifact_becomes_a_blob_and_its_bytes_travel_beside_the_manifest() {
    let (a, a_bytes) = held("a");
    let (b, b_bytes) = held("b");
    let assembled = assemble(
        &[
            plugin(
                "one",
                Contribution {
                    artifacts: vec![carried("a.txt", "a")],
                    ..Default::default()
                },
            ),
            plugin(
                "two",
                Contribution {
                    artifacts: vec![
                        carried("b.txt", "b"),
                        artifact("c.jar", "https://x/c.jar").into(),
                    ],
                    ..Default::default()
                },
            ),
        ],
        &config(),
    );
    // The manifest names the bytes and says nothing of where they were.
    assert_eq!(
        assembled.manifest.artifacts[..2],
        [
            Artifact::blob("a.txt", &a, 1),
            Artifact::blob("b.txt", &b, 1)
        ]
    );
    assert_eq!(assembled.blobs, Blobs::from([(a, a_bytes), (b, b_bytes)]));
    assert!(assembled.warnings.is_empty());
}

#[test]
fn a_carried_file_is_read_and_named_by_its_content() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("pack.toml");
    std::fs::write(&file, "hello").unwrap();
    let assembled = assemble(
        &[plugin(
            "files",
            Contribution {
                artifacts: vec![BuildArtifact::file("config/pack.toml", &file)],
                ..Default::default()
            },
        )],
        &config(),
    );
    let id = blob_id(b"hello");
    assert_eq!(
        assembled.manifest.artifacts,
        [Artifact::blob("config/pack.toml", &id, 5)]
    );
    assert_eq!(assembled.blobs, Blobs::from([(id, BlobSource::File(file))]));
}

#[test]
fn a_carried_file_that_is_gone_stops_the_build_and_names_its_plugin() {
    let error = try_assemble(
        &[plugin(
            "files",
            Contribution {
                artifacts: vec![BuildArtifact::file("a.txt", "/nonexistent/a.txt")],
                ..Default::default()
            },
        )],
        &config(),
    )
    .unwrap_err();
    let message = error.to_string();
    assert!(message.contains("plugin 'files'"), "{message}");
    assert!(message.contains("/nonexistent/a.txt"), "{message}");
}

#[test]
fn a_blob_whose_artifact_was_replaced_is_dropped_with_it() {
    let (new, new_bytes) = held("new");
    let assembled = assemble(
        &[
            plugin(
                "one",
                Contribution {
                    artifacts: vec![carried("config.toml", "old")],
                    ..Default::default()
                },
            ),
            plugin(
                "two",
                Contribution {
                    artifacts: vec![carried("config.toml", "new")],
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
fn two_plugins_carrying_the_same_bytes_is_not_a_collision() {
    let contribution = |path: &str| Contribution {
        artifacts: vec![carried(path, "shared")],
        ..Default::default()
    };
    let assembled = assemble(
        &[
            plugin("one", contribution("a")),
            plugin("two", contribution("b")),
        ],
        &config(),
    );
    assert_eq!(assembled.manifest.artifacts.len(), 2);
    assert_eq!(assembled.blobs.len(), 1);
    assert!(assembled.warnings.is_empty());
}

#[test]
fn a_contribution_reads_where_an_artifacts_bytes_are_off_the_wire() {
    let output: PluginOutput = serde_json::from_value(serde_json::json!({
        "name": "files",
        "contribution": {
            "artifacts": [
                { "path": "a.txt", "source": { "file": "/srv/build/a.txt" }, "rules": "allow.os.linux" },
                { "path": "b.txt", "source": { "bytes": "aGVsbG8=" } },
                { "path": "c.jar", "source": { "url": "https://x/c.jar" } },
            ],
        },
    }))
    .unwrap();
    let [a, b, c] = &output.contribution.artifacts[..] else {
        panic!("three artifacts");
    };
    assert_eq!(a.path(), Some("a.txt"));
    // Everything but the source is read by the manifest's own reader.
    let (b, bytes) = b.clone().resolve().unwrap();
    assert_eq!(b, Artifact::blob("b.txt", blob_id(b"hello"), 5));
    assert_eq!(bytes.unwrap().1, BlobSource::Bytes(b"hello".to_vec()));
    assert_eq!(
        c.clone().resolve().unwrap().0,
        artifact("c.jar", "https://x/c.jar")
    );
    // What it serialises to is what it reads.
    let wire = serde_json::to_value(&output.contribution.artifacts).unwrap();
    assert_eq!(wire[0]["rules"], serde_json::json!("allow.os.linux"));
    assert_eq!(
        wire[0]["source"],
        serde_json::json!({ "file": "/srv/build/a.txt" })
    );
    assert_eq!(
        serde_json::from_value::<Vec<BuildArtifact>>(wire).unwrap(),
        output.contribution.artifacts
    );
}

#[test]
fn an_artifact_with_a_source_nobody_knows_is_refused() {
    for source in [
        serde_json::json!({ "string": "hi" }),
        serde_json::json!({ "file": "/a", "bytes": "aA==" }),
    ] {
        let wrong = serde_json::from_value::<BuildArtifact>(
            serde_json::json!({ "path": "a", "source": source }),
        );
        assert!(wrong.is_err());
    }
    assert!(serde_json::from_value::<BuildArtifact>(serde_json::json!({ "path": "a" })).is_err());
    // A field the manifest's reader does not know stops the merge.
    let odd: BuildArtifact = serde_json::from_value(
        serde_json::json!({ "path": "a", "source": { "bytes": "aA==" }, "nope": 1 }),
    )
    .unwrap();
    assert!(odd.resolve().unwrap_err().to_string().contains("nope"));
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
