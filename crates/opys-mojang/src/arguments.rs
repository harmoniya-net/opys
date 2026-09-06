//! Version-JSON `arguments` / `minecraftArguments`.

use opys_mojang_rules::Ruleset;
use serde::{Deserialize, Serialize};

/// `value` keeps the shape it arrived in — a bare string stays a string, an
/// array stays an array. Normalising here would change the encoded manifest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ArgValue {
    One(String),
    Many(Vec<String>),
}

/// A raw Mojang argument: a plain string, or a rule-gated `{ rules, value }`.
///
/// Deliberately *not* `Val`/`Valset` — those live in `opys-core`, and this
/// crate must not depend on it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MojangArgValue {
    Plain(String),
    Conditional { rules: Ruleset, value: ArgValue },
}

/// Either form of the arguments field: the modern `{ game, jvm }` object, or
/// the legacy whitespace-separated string.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(from = "ArgumentsWire")]
pub struct Arguments {
    pub game: Vec<MojangArgValue>,
    pub jvm: Vec<MojangArgValue>,
    /// True when parsed from the legacy `minecraftArguments` string field.
    pub legacy: bool,
}

impl Arguments {
    /// JVM arguments implied by a legacy `minecraftArguments` version JSON.
    pub fn legacy_jvm_args() -> Vec<MojangArgValue> {
        [
            "-Djava.library.path=${natives_directory}",
            "-cp",
            "${classpath}",
        ]
        .into_iter()
        .map(|s| MojangArgValue::Plain(s.to_owned()))
        .collect()
    }

    /// Merge a patch version's arguments onto these (`inheritsFrom`).
    /// A legacy patch carries no structured delta, so `self` passes through.
    pub fn merge(&self, patch: &Arguments) -> Arguments {
        if patch.legacy {
            return self.clone();
        }
        Arguments {
            jvm: [self.jvm.clone(), patch.jvm.clone()].concat(),
            game: [self.game.clone(), patch.game.clone()].concat(),
            legacy: false,
        }
    }
}

#[derive(Deserialize)]
#[serde(untagged)]
enum ArgumentsWire {
    Legacy(String),
    Modern {
        #[serde(default)]
        game: Vec<MojangArgValue>,
        #[serde(default)]
        jvm: Vec<MojangArgValue>,
    },
}

impl From<ArgumentsWire> for Arguments {
    fn from(wire: ArgumentsWire) -> Self {
        match wire {
            ArgumentsWire::Legacy(s) => Arguments {
                game: s
                    .split_whitespace()
                    .map(|a| MojangArgValue::Plain(a.to_owned()))
                    .collect(),
                jvm: Arguments::legacy_jvm_args(),
                legacy: true,
            },
            ArgumentsWire::Modern { game, jvm } => Arguments {
                game,
                jvm,
                legacy: false,
            },
        }
    }
}
