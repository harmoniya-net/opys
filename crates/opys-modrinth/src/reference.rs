//! The strings a config may name a Modrinth version or modpack by.
//!
//! Both accept what a person pastes: the id, or the page's URL.

use crate::error::ModrinthError;

/// The id after `/version/` in a Modrinth URL, up to the next `/`, `?` or `#`.
fn version_segment(reference: &str) -> Option<&str> {
    let (_, after) = reference.split_once("/version/")?;
    let id = after.split(['/', '?', '#']).next().unwrap_or_default();
    (!id.is_empty()).then_some(id)
}

/// A version id out of a version reference: the id itself (base62, e.g.
/// `JjCVwmVA`), or the version's URL
/// (`https://modrinth.com/mod/<slug>/version/<id>`). Any other URL is refused
/// rather than sent to the API as an id.
pub fn parse_version_ref(reference: &str) -> Result<&str, ModrinthError> {
    if let Some(id) = version_segment(reference) {
        return Ok(id);
    }
    if reference.contains("://") {
        return Err(ModrinthError::BadVersionRef(reference.to_owned()));
    }
    Ok(reference)
}

/// What a modpack reference points at.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModpackRef<'a> {
    /// The `.mrpack` itself.
    Url(&'a str),
    /// A version whose files include one.
    Version(&'a str),
}

/// A modpack reference: a version id, the version's URL, or a direct link to
/// the `.mrpack`.
pub fn parse_modpack_ref(reference: &str) -> Result<ModpackRef<'_>, ModrinthError> {
    if reference.ends_with(".mrpack") || reference.contains("cdn.modrinth.com") {
        return Ok(ModpackRef::Url(reference));
    }
    if let Some(id) = version_segment(reference) {
        return Ok(ModpackRef::Version(id));
    }
    if reference.contains("://") {
        return Err(ModrinthError::BadModpackRef(reference.to_owned()));
    }
    Ok(ModpackRef::Version(reference))
}
