//! `@opys/core` — manifest data model, shorthand, Val/Valset, glob,
//! interpolation. Reference implementation of the frozen `opys.json` wire
//! format. Mirrors the TS package one-to-one.
//!
//! Depends on `opys-mojang-rules` for the rule format/evaluator.

mod artifact;
mod discovery;
mod extract;
mod glob;
mod integrity;
mod interpolate;
mod launch;
mod manifest;
mod pointer;
mod shorthand;
mod source;
mod val;
mod valdefs;

pub use artifact::{deduplicate_artifacts, Artifact};
pub use discovery::{Discovery, HashRef, IntegrityProbes, SizeProbes};
pub use extract::{ExtractDump, ExtractPick, ExtractRule, ExtractScan};
pub use glob::{glob_base, glob_to_regex};
pub use integrity::{HashAlgo, HashEntry, Integrity};
pub use interpolate::{interpolate, resolve_vars, VarMap};
pub use launch::{resolved_args, resolved_envs, Launch};
pub use manifest::{filter_manifest, parse_manifest, Manifest};
pub use pointer::{parse_pointer_descriptor, PointerDescriptor};
pub use shorthand::{
    encode_short_rule, encode_short_ruleset, parse_short_rule, parse_short_ruleset, RawRuleset,
    RawSingle, ShorthandError,
};
pub use source::Source;
pub use val::{resolve_valset, Val, Valset};
pub use valdefs::{resolve_val_defs, ConditionalVal, ValDef, ValDefs};

pub use opys_mojang_rules::{
    allow_os_ruleset, empty_ruleset, satisfies_features, satisfies_os, satisfies_rule,
    satisfies_ruleset, FeatureConstraint, OsArch, OsConstraint, OsName, OsOptions, Rule,
    RuleAction, RuleError, Ruleset,
};

#[derive(Debug, thiserror::Error)]
pub enum DecodeError {
    #[error("Failed to parse manifest: {0}")]
    Manifest(String),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Shorthand(#[from] ShorthandError),
}
