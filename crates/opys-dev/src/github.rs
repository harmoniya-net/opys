//! Shared GitHub Releases helpers.
//!
//! Several loaders — GraalVM CE here, and the forge family once it ports —
//! resolve their versions straight off GitHub Releases. Listing the releases
//! and reading an asset's digest live here so no resolver carries its own
//! copy.
//!
//! `@opys/dev`'s `github.ts` is still the JS spelling of this while the
//! forge-family loaders remain in TypeScript; it retires with them.

use serde::{Deserialize, Serialize};

use crate::http::{self, HttpError};

/// Where the Releases API lives. Overridable per call so a resolver can point
/// at a GitHub Enterprise host or a mirror, matching the `api_base` the
/// Adoptium and Azul resolvers already take.
pub const GITHUB_API_BASE: &str = "https://api.github.com";

/// A single asset on a release, mirroring the `/releases` API shape.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitHubAsset {
    pub name: String,
    pub size: u64,
    pub browser_download_url: String,
    /// `sha256:<hex>` when present (GitHub added it in 2024); older releases
    /// have no digest at all.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub digest: Option<String>,
}

/// A single release entry from the `/releases` API.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitHubRelease {
    pub tag_name: String,
    #[serde(default)]
    pub prerelease: bool,
    #[serde(default)]
    pub draft: bool,
    #[serde(default)]
    pub published_at: String,
    #[serde(default)]
    pub assets: Vec<GitHubAsset>,
}

/// Which release to take off the listing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReleaseSelector<'a> {
    /// Newest non-prerelease.
    Latest,
    /// Newest, prereleases included.
    Prerelease,
    /// Exact `tag_name` match.
    Tag(&'a str),
}

#[derive(Debug, thiserror::Error)]
pub enum GitHubError {
    #[error(transparent)]
    Http(#[from] HttpError),
    #[error("GitHub API {status} listing {repo} releases")]
    Api { status: u16, repo: String },
    #[error("GitHub returned an unreadable release listing for {repo}: {source}")]
    Malformed {
        repo: String,
        #[source]
        source: serde_json::Error,
    },
    #[error("No {stability}GitHub release in {repo}{filtered}")]
    NoRelease {
        /// `"stable "` or empty — the JS spelling collapses the gap when the
        /// selector allows prereleases.
        stability: &'static str,
        repo: String,
        /// `" matching the loader filter"` or empty.
        filtered: &'static str,
    },
    #[error("GitHub release '{tag}' not found in {repo}. Available: {available}")]
    NoTag {
        tag: String,
        repo: String,
        available: String,
    },
}

/// List all releases for `repo` (`owner/name`), newest first — a single page
/// of up to 100. `token` raises the rate limit.
pub fn list_github_releases(
    api_base: &str,
    repo: &str,
    token: Option<&str>,
) -> Result<Vec<GitHubRelease>, GitHubError> {
    let url = format!("{api_base}/repos/{repo}/releases?per_page=100");
    let auth = token.map(|t| format!("Bearer {t}"));
    let mut headers: Vec<(&str, &str)> = vec![
        ("Accept", "application/vnd.github+json"),
        ("X-GitHub-Api-Version", "2022-11-28"),
    ];
    if let Some(auth) = auth.as_deref() {
        headers.push(("Authorization", auth));
    }

    let res = http::get(&url, &headers)?;
    if !res.ok() {
        return Err(GitHubError::Api {
            status: res.status,
            repo: repo.to_owned(),
        });
    }
    serde_json::from_str(&res.body).map_err(|source| GitHubError::Malformed {
        repo: repo.to_owned(),
        source,
    })
}

/// The hex sha256 behind an asset's `digest` field, when GitHub computed one.
pub fn github_asset_sha256(asset: &GitHubAsset) -> Option<&str> {
    asset.digest.as_deref()?.strip_prefix("sha256:")
}

/// Apply a selector to an already-narrowed candidate list. Pure — the
/// caller has done the draft/filter pass.
pub fn select_github_release<'r>(
    releases: &'r [GitHubRelease],
    selector: &ReleaseSelector<'_>,
) -> Option<&'r GitHubRelease> {
    match selector {
        ReleaseSelector::Latest => releases.iter().find(|r| !r.prerelease),
        ReleaseSelector::Prerelease => releases.first(),
        ReleaseSelector::Tag(tag) => releases.iter().find(|r| r.tag_name == *tag),
    }
}

/// Fetch `repo`'s releases and pick the one matching `selector`. Drafts are
/// always skipped; `filter` further narrows candidates first — use it when
/// the loader needs specific assets present, so `Latest` falls through to the
/// newest release that actually qualifies.
pub fn pick_github_release(
    api_base: &str,
    repo: &str,
    selector: &ReleaseSelector<'_>,
    token: Option<&str>,
    filter: Option<&dyn Fn(&GitHubRelease) -> bool>,
) -> Result<GitHubRelease, GitHubError> {
    let candidates: Vec<GitHubRelease> = list_github_releases(api_base, repo, token)?
        .into_iter()
        .filter(|r| !r.draft)
        .filter(|r| match filter {
            Some(keep) => keep(r),
            None => true,
        })
        .collect();

    if let Some(picked) = select_github_release(&candidates, selector) {
        return Ok(picked.clone());
    }

    let filtered = if filter.is_some() {
        " matching the loader filter"
    } else {
        ""
    };
    match selector {
        ReleaseSelector::Latest => Err(GitHubError::NoRelease {
            stability: "stable ",
            repo: repo.to_owned(),
            filtered,
        }),
        ReleaseSelector::Prerelease => Err(GitHubError::NoRelease {
            stability: "",
            repo: repo.to_owned(),
            filtered,
        }),
        ReleaseSelector::Tag(tag) => {
            let tags: Vec<&str> = candidates
                .iter()
                .take(5)
                .map(|r| r.tag_name.as_str())
                .collect();
            let mut available = tags.join(", ");
            if candidates.len() > 5 {
                available.push_str(", …");
            }
            Err(GitHubError::NoTag {
                tag: (*tag).to_owned(),
                repo: repo.to_owned(),
                available,
            })
        }
    }
}
