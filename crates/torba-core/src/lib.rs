//! `@torba/core` — manifest data model, shorthand, Val/Valset, glob,
//! interpolation. Reference implementation of the frozen `torba.json` wire
//! format. Mirrors the TS package one-to-one.
//!
//! Depends on `torba-mojang-rules` for the rule format/evaluator.

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

pub use artifact::{
    artifact_applies, decode_artifact, deduplicate_artifacts, encode_artifact, Artifact,
    ArtifactWire,
};
pub use discovery::{Discovery, HashRef, IntegrityProbes, SizeProbes};
pub use extract::{
    decode_extract, encode_extract, ExtractDump, ExtractPick, ExtractRule, ExtractScan,
    ExtractWire,
};
pub use glob::{glob_base, glob_to_regex};
pub use integrity::{HashAlgo, HashEntry, Integrity};
pub use interpolate::{interpolate, resolve_vars, VarMap};
pub use launch::{
    decode_launch, encode_launch, resolved_args, resolved_envs, Launch, LaunchWire,
};
pub use manifest::{
    decode_manifest, encode_manifest, filter_manifest, parse_manifest, Manifest, ManifestWire,
};
pub use pointer::{
    decode_pointer_descriptor, encode_pointer_descriptor, parse_pointer_descriptor,
    PointerDescriptor, PointerDescriptorWire,
};
pub use shorthand::{
    encode_short_rule, encode_short_ruleset, parse_short_rule, parse_short_ruleset, RawRuleset,
    RawSingle, ShorthandError,
};
pub use source::{decode_source, encode_source, Source, SourceWire};
pub use val::{encode_val, encode_valset, parse_val, parse_valset, resolve_valset, Val, Valset};
pub use valdefs::{
    encode_val_defs, parse_val_defs, resolve_val_defs, ConditionalVal, ValDef, ValDefs,
};

pub use torba_mojang_rules::{
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
