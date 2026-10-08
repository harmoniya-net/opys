//! What an installation should not have.
//!
//! A rule names files by glob — `includes`, less `excludes` — and an
//! installer removes the ones that match once everything else is in place.
//! What the manifest itself installs is never among them, so a rule can say
//! "every jar in `mods/`" and mean every jar the manifest did not put there.

use serde::{Deserialize, Serialize};

/// The wire spelling is the type: both lists are plain globs, interpolated by
/// whoever applies the rule.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CleanupRule {
    pub includes: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub excludes: Vec<String>,
}
