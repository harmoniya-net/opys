//! `opys-links` — a link, resolved to a file.
//!
//! The thing a config author has is a URL: a release asset on GitHub, a file
//! in a GitLab package registry, a mod's page on Modrinth or CurseForge, or
//! simply somewhere a file is served. The thing a manifest needs is a
//! concrete download with a size and a hash. This crate is the step between.
//!
//! [`parse_link`] reads the URL — purely, no request — and says which provider
//! it belongs to and what it names there. [`resolve_links`] then asks that
//! provider. Each one publishes a hash its own way (GitHub a digest, GitLab a
//! `file_sha256`, Modrinth and CurseForge a sha1), and a provider that
//! publishes none, or a URL that belongs to no provider at all, is handled the
//! one way that always works: the file is downloaded here, once, and hashed.
//! So every link comes out pinned, and nothing is left for the installing
//! machine to find out.
//!
//! The provider clients are not here. GitHub and GitLab are `opys-dev`'s,
//! Modrinth and CurseForge their own crates; this one only dispatches.
//!
//! Build-time only: the requests go through `opys-dev`'s blocking client,
//! which the runtime never links.

mod error;
mod link;
mod resolve;

pub use error::LinkError;
pub use link::{parse_link, GitHubRelease, Link};
pub use resolve::{file_artifacts, resolve_links, LinkOptions, Provider, ResolvedFile};
