//! The Java that is already on the machine, in place of one the pack ships.
//!
//! Nothing is resolved and nothing is installed, so this is pure: no request,
//! no artifact. The whole of it is where `${java_bin}` points.
//!
//! By default that is `java`, found on `PATH` by whoever spawns it. A manifest
//! cannot name a directory it has never seen, and it cannot ask whether a
//! variable was handed in either: a rule tests the OS and the features and
//! nothing else. So a Java the player picked is said with a feature,
//! [`CUSTOM_JAVA`], and with it on the binary is the one under
//! `${java_home}`, which the launcher supplies as a var.

use opys_core::{ConditionalVal, MojangRule, OsName, RuleAction, ValDef};
use opys_dev::{Contribution, LaunchFragment, PluginOutput};

use crate::plugin::PLUGIN_NAME;
use crate::template::{allow_os, feature_rule, JAVA_CONSOLE};

/// The feature that says the player named a Java of their own, as
/// `${java_home}`. With it off, `java` comes from `PATH`.
pub const CUSTOM_JAVA: &str = "custom_java";

fn arm(value: &str, rules: Vec<MojangRule>) -> ConditionalVal {
    ConditionalVal {
        value: value.to_owned(),
        rules,
    }
}

fn custom() -> MojangRule {
    feature_rule(RuleAction::Allow, CUSTOM_JAVA, true)
}

fn console(action: RuleAction) -> MojangRule {
    feature_rule(action, JAVA_CONSOLE, true)
}

/// `java_bin`, most general first: the last arm that passes is the one used,
/// so each later arm is a narrower case of one before it. On Windows the
/// same `javaw` / `java` pair as a shipped JDK, behind the same feature.
fn bin_arms() -> Vec<ConditionalVal> {
    let windows = || allow_os(OsName::Windows);
    vec![
        arm("java", vec![]),
        arm("javaw", vec![windows(), console(RuleAction::Disallow)]),
        arm("${java_home}/bin/java", vec![custom()]),
        arm(
            "${java_home}/bin/javaw.exe",
            vec![windows(), custom(), console(RuleAction::Disallow)],
        ),
        arm(
            "${java_home}/bin/java.exe",
            vec![windows(), custom(), console(RuleAction::Allow)],
        ),
    ]
}

/// The `java` plugin for a pack that ships no JDK.
///
/// It owns `java_bin` and nothing else. `java_home` is the launcher's to
/// give, so there is no `home` launch group to name, and `JAVA_HOME` is set
/// for the game only where there is a home to set it to.
pub fn system_java() -> PluginOutput {
    PluginOutput {
        name: PLUGIN_NAME.to_owned(),
        contribution: Contribution {
            artifacts: Vec::new(),
            vars: [("java_bin".to_owned(), ValDef::Arms(bin_arms()))]
                .into_iter()
                .collect(),
            launch: [(
                "bin".to_owned(),
                LaunchFragment::Text("${java_bin}".to_owned()),
            )]
            .into_iter()
            .collect(),
            envs: [(
                "JAVA_HOME".to_owned(),
                ValDef::Arms(vec![arm("${java_home}", vec![custom()])]),
            )]
            .into_iter()
            .collect(),
        },
    }
}
