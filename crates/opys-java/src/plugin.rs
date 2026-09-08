//! The `java` plugin: a resolved JDK as a ready-to-merge contribution.

use opys_core::ValDef;
use opys_dev::{Contribution, LaunchFragment, PluginOutput};

use crate::error::JavaError;
use crate::template::{resolve_java, JavaOptions};
use crate::vendor::VendorRelease;

/// The name this plugin claims in the plugin map, and the one collision
/// warnings point at.
pub const PLUGIN_NAME: &str = "java";

/// A finished `java` build: the contribution to merge, plus the release it
/// came from so the host can log which JDK it got.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JavaBuild {
    pub output: PluginOutput,
    pub release: VendorRelease,
}

/// Provision a JDK runtime. Solely owns the `java_home` / `java_bin` /
/// `java_runtime_dir` vars and exposes `bin` as a launch group, so a config
/// wires the launch command with `command: ({ java }) => java.bin`.
pub fn build_java(options: &JavaOptions) -> Result<JavaBuild, JavaError> {
    let template = resolve_java(options)?;

    let contribution = Contribution {
        artifacts: template.artifacts,
        vars: template.vars,
        launch: [(
            "bin".to_owned(),
            LaunchFragment::Text("${java_bin}".to_owned()),
        )]
        .into_iter()
        .collect(),
        // Export JAVA_HOME by default so tools spawned at launch (e.g. the
        // dgpuj launcher) locate the provisioned JDK with no extra wiring.
        envs: [(
            "JAVA_HOME".to_owned(),
            ValDef::Flat("${java_home}".to_owned()),
        )]
        .into_iter()
        .collect(),
    };

    Ok(JavaBuild {
        output: PluginOutput {
            name: PLUGIN_NAME.to_owned(),
            contribution,
        },
        release: template.release,
    })
}
