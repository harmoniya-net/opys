//! `@opys/core` — manifest data model, shorthand, Val/Valset, glob,
//! interpolation, and the bundle a manifest is published as. Reference
//! implementation of the manifest format. Mirrors the TS package one-to-one.
//!
//! Depends on `opys-mojang-rules` for the rule format/evaluator.

mod artifact;
mod blob;
mod bundle;
mod cleanup;
mod extract;
mod glob;
mod integrity;
mod interpolate;
mod launch;
mod manifest;
mod shorthand;
mod source;
mod val;
mod valdefs;

pub use artifact::{deduplicate_artifacts, Artifact, ArtifactError};
pub use blob::{blob_id, blob_id_of, is_blob_id, BlobSource, Blobs};
pub use bundle::{
    open_bundle, read_bundle_head, write_bundle, Bundle, BundleError, Head, BUNDLE_FORMAT,
};
pub use cleanup::CleanupRule;
pub use extract::{ExtractDump, ExtractPick, ExtractRule, ExtractScan};
pub use glob::{glob_base, glob_to_regex};
pub use integrity::{HashAlgo, HashEntry, Integrity};
pub use interpolate::{interpolate, resolve_vars, VarMap};
pub use launch::{resolved_args, resolved_envs, Launch};
pub use manifest::{filter_manifest, parse_manifest, Manifest};
// `Rule` / `Ruleset` are opys's own: how a rule is spelled in a manifest,
// shorthand or expanded. `MojangRule` / `MojangRuleset` below are what either
// expands to, and what the evaluator takes.
pub use shorthand::{
    encode_short_rule, encode_short_ruleset, parse_short_rule, parse_short_ruleset, Rule, Ruleset,
    ShorthandError,
};
pub use source::{Source, SourceError};
pub use val::{resolve_valset, Val, Valset};
pub use valdefs::{resolve_val_defs, ConditionalVal, ValDef, ValDefs};

pub use opys_mojang_rules::{
    allow_os_ruleset, empty_ruleset, satisfies_features, satisfies_os, satisfies_rule,
    satisfies_ruleset, FeatureConstraint, MojangRule, MojangRuleset, OsArch, OsConstraint, OsName,
    OsOptions, RuleAction, RuleError,
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
