//! Version-input normalisation shared by the vendor resolvers.

/// What the caller asked for, once classified. Every vendor accepts a bare
/// major (`"21"` — give me the latest GA) and a full, exact version; only the
/// spelling of "full" differs, so each resolver normalises into this itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum VersionInput {
    Major(String),
    Full(String),
}

/// `"21"` — digits and nothing else.
pub(crate) fn is_bare_major(v: &str) -> bool {
    !v.is_empty() && v.bytes().all(|b| b.is_ascii_digit())
}

/// Leading digits, and how many.
pub(crate) fn leading_digits(v: &str) -> usize {
    v.bytes().take_while(u8::is_ascii_digit).count()
}
