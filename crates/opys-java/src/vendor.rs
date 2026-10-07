use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use crate::platforms::Platform;

/// One resolved, downloadable JDK binary for a single platform. Every vendor
/// resolver (temurin/zulu/graalvm) produces this shape so the template can
/// turn it into an `Artifact` without vendor-specific branching.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VendorBinary {
    pub platform: Platform,
    pub filename: String,
    pub url: String,
    pub size: u64,
    /// Every vendor resolver pins one today. It stays optional because the
    /// shape is also an input: a caller may hand the template a binary it
    /// resolved itself and has no hash for.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
}

/// A resolved JDK release — vendor-agnostic input to the shared template.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VendorRelease {
    /// Human-readable label for the host's log, e.g. `Temurin 21.0.13+11`.
    pub label: String,
    /// Major version — buckets the runtime dir as `jdk-<major>`.
    pub major: u32,
    pub binaries: Vec<VendorBinary>,
}

/// Pick the value most items agree on (by `key`), tie-broken by the
/// lexicographically larger value. Per-platform release queries can
/// independently resolve to slightly different versions (a build just
/// published for linux but not yet for windows); anchoring on the majority
/// value and dropping the rest keeps every platform on one coherent release
/// instead of shipping a mismatched bundle.
///
/// The tie-break compares by byte order where the TS original used
/// `localeCompare`. They agree on the ASCII version strings these APIs
/// return, and the tie-break only ever runs when two different releases have
/// exactly equal platform counts.
///
/// `items` must be non-empty — callers check that before anchoring.
pub fn pick_anchor<T>(items: &[T], key: impl Fn(&T) -> String) -> String {
    let mut counts: IndexMap<String, usize> = IndexMap::new();
    for item in items {
        *counts.entry(key(item)).or_insert(0) += 1;
    }
    counts
        .into_iter()
        .max_by(|a, b| a.1.cmp(&b.1).then_with(|| a.0.cmp(&b.0)))
        .map(|(value, _)| value)
        .expect("callers check `items` is non-empty")
}
