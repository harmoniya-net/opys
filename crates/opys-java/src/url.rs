//! URL escaping for the vendor resolvers.
//!
//! `percent-encoding` does the work — it is already in the tree under `ureq`,
//! which does not re-export it.

use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};

/// `encodeURIComponent`'s unreserved set: `A-Za-z0-9-_.!~*'()`.
const URI_COMPONENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'!')
    .remove(b'~')
    .remove(b'*')
    .remove(b'\'')
    .remove(b'(')
    .remove(b')');

/// Escape one path segment or query value, `encodeURIComponent`-style. Needed
/// wherever a caller's string reaches a URL: a Temurin release name like
/// `jdk-21.0.13+11` has to travel as `%2B`, or Adoptium reads it as a space
/// and the lookup misses.
pub fn encode_uri_component(s: &str) -> String {
    utf8_percent_encode(s, URI_COMPONENT).to_string()
}
