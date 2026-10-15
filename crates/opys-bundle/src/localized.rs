//! Text a player reads, in one language or several.
//!
//! An option's title, subtitle, unit and placeholder and a choice's label are
//! each a string or a map from a language to the string in it:
//! `"RAM"` or `{ "en": "RAM", "uk": "Пам'ять" }`. A string is in the head's
//! `locale`, and a map must hold that language, so whatever language a
//! launcher asks for there is always something to show. Which language a
//! player gets is the launcher's to choose; this says only what there is.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// Text a player reads. Kept as it was written, a string or a map, so that
/// what is read back is what was written.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "LocalizedWire", into = "LocalizedWire")]
pub enum Localized {
    /// In the head's `locale`.
    Plain(String),
    /// Language to text. Never empty, and every key is a language tag.
    Translated(BTreeMap<String, String>),
}

impl Localized {
    /// The languages a map names, and none for a string: that is in
    /// whatever the head's `locale` is.
    pub fn languages(&self) -> impl Iterator<Item = &str> {
        let map = match self {
            Localized::Plain(_) => None,
            Localized::Translated(map) => Some(map.keys().map(String::as_str)),
        };
        map.into_iter().flatten()
    }
}

impl From<&str> for Localized {
    fn from(text: &str) -> Self {
        Localized::Plain(text.to_owned())
    }
}

/// Told apart by its JSON type, a string or an object, which is the whole
/// difference between the two spellings.
#[derive(Serialize, Deserialize)]
#[serde(untagged)]
pub(crate) enum LocalizedWire {
    Plain(String),
    Translated(BTreeMap<String, String>),
}

impl TryFrom<LocalizedWire> for Localized {
    type Error = String;

    fn try_from(raw: LocalizedWire) -> Result<Self, Self::Error> {
        match raw {
            LocalizedWire::Plain(text) => Ok(Localized::Plain(text)),
            LocalizedWire::Translated(map) => {
                if map.is_empty() {
                    return Err("a translated text names no language".to_owned());
                }
                if let Some(bad) = map.keys().find(|tag| !is_language_tag(tag)) {
                    return Err(format!("`{bad}` is not a language tag"));
                }
                Ok(Localized::Translated(map))
            }
        }
    }
}

impl From<Localized> for LocalizedWire {
    fn from(text: Localized) -> Self {
        match text {
            Localized::Plain(text) => LocalizedWire::Plain(text),
            Localized::Translated(map) => LocalizedWire::Translated(map),
        }
    }
}

/// The shape of a BCP 47 tag, `uk` or `pt-BR`: a language of two or three
/// letters, then subtags of one to eight letters or digits. Whether the
/// language exists is not asked; a launcher that does not know it matches
/// nothing and falls back to the head's `locale`.
pub fn is_language_tag(tag: &str) -> bool {
    let mut parts = tag.split('-');
    let language = parts.next().unwrap_or_default();
    (2..=3).contains(&language.len())
        && language.bytes().all(|b| b.is_ascii_alphabetic())
        && parts.all(|part| {
            (1..=8).contains(&part.len()) && part.bytes().all(|b| b.is_ascii_alphanumeric())
        })
}
