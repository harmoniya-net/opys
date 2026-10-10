//! The `java` plugin: a resolved JDK as a ready-to-merge contribution.

use opys_core::ValDef;
use opys_dev::{Contribution, LaunchFragment, PluginOutput};

use crate::error::JavaError;
use crate::system::system_java;
use crate::template::{resolve_java, JavaOptions};
use crate::vendor::VendorRelease;

/// The name this plugin claims in the plugin map, and the one collision
/// warnings point at.
pub const PLUGIN_NAME: &str = "java";

/// A finished `java` build: the contribution to merge, plus the release it
/// came from so the host can log which JDK it got. There is no release where
/// the pack ships none and runs on the machine's own.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JavaBuild {
    pub output: PluginOutput,
    pub release: Option<VendorRelease>,
}

/// Provision a JDK runtime. Solely owns the `java_home` / `java_bin` /
/// `java_runtime_dir` vars and exposes two launch groups: `bin`, the
/// executable, and `home`, the JDK it is in. `home` is there for whatever is
/// started in place of `java` and has to be told where the JDK is — the dgpuj
/// launcher's `--dgpuj-home` — so that the config names this plugin for it
/// rather than a variable it hopes somebody defined.
///
/// With `system` it ships no JDK instead: see [`system_java`]. The two are
/// told apart by that one field, and a field of the other is refused rather
/// than ignored, since `java({ system: true, version: '21' })` reads as a
/// promise about which Java the game gets and nothing here could keep it.
pub fn build_java(options: &JavaOptions) -> Result<JavaBuild, JavaError> {
    if options.system {
        return match options.resolved_field() {
            Some(field) => Err(JavaError::SystemWith { field }),
            None => Ok(JavaBuild {
                output: system_java(),
                release: None,
            }),
        };
    }
    let template = resolve_java(options)?;

    let contribution = Contribution {
        artifacts: template.artifacts.into_iter().map(Into::into).collect(),
        // Every artifact here is a download; none travels with the manifest.
        vars: template.vars,
        launch: [
            (
                "bin".to_owned(),
                LaunchFragment::Text("${java_bin}".to_owned()),
            ),
            (
                "home".to_owned(),
                LaunchFragment::Text("${java_home}".to_owned()),
            ),
        ]
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
        release: Some(template.release),
    })
}
