//! Mojang-standard rule format: `os` / `features` / `rule` / `ruleset`.
//!
//! Port of `@opys/mojang-rules`. Leaf crate — no opys deps.
//! See `CLAUDE.md` for the invariant: one rule schema, one evaluator,
//! monorepo-wide.

mod features;
mod os;
mod rule;
mod ruleset;

pub use features::{satisfies_features, FeatureConstraint};
pub use os::{satisfies_os, OsArch, OsConstraint, OsName, OsOptions, RuleError};
pub use rule::{satisfies_rule, Rule, RuleAction};
pub use ruleset::{allow_os_ruleset, empty_ruleset, satisfies_ruleset, Ruleset};
