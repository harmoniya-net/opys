//! URL escaping for build-time resolvers.
//!
//! `percent-encoding` does the work — it is already in the tree under `ureq`,
//! which does not re-export it. It began in `opys-java` and moved here when a
//! second resolver needed it: a GitLab project path travels as one segment,
//! `group%2Fname`.

use percent_encoding::{percent_decode_str, utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};

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

/// Undo [`encode_uri_component`] on one path segment. A segment that does not
/// decode to UTF-8 is returned as it was written — it is somebody's file name,
/// and being wrong about its spelling is worse than leaving it escaped.
pub fn decode_uri_component(s: &str) -> String {
    percent_decode_str(s)
        .decode_utf8()
        .map(|decoded| decoded.into_owned())
        .unwrap_or_else(|_| s.to_owned())
}
