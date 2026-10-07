//! Reading a URL for what it names. No request is made here.

use opys_dev::url::decode_uri_component;

use crate::error::LinkError;

/// Which release of a GitHub repository an asset is taken from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GitHubRelease {
    /// `…/releases/latest/download/<asset>` — the newest release that is not
    /// a prerelease, whichever that is when the manifest is built.
    Latest,
    /// `…/releases/download/<tag>/<asset>`.
    Tag(String),
}

/// What a link names, and on which provider.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Link {
    /// A release asset.
    GitHub {
        /// `owner/name`.
        repo: String,
        release: GitHubRelease,
        asset: String,
    },
    /// A file in a generic package registry, by its API download URL.
    GitLab {
        /// The instance, `https://gitlab.com` or a self-hosted one.
        base: String,
        /// Project path (`group/name`) or numeric id.
        project: String,
        package: String,
        version: String,
        file: String,
    },
    /// A Modrinth version; it resolves to that version's primary file.
    Modrinth { version_id: String },
    /// A CurseForge file.
    CurseForge { file_id: u64 },
    /// Anything else that is a URL: taken as the file itself.
    Url(String),
}

/// `(scheme://host, host, path segments)` of an http(s) URL, the query and
/// fragment dropped. Segments are left as written.
fn split(url: &str) -> Option<(&str, &str, Vec<&str>)> {
    let after_scheme = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))?;
    let end = after_scheme
        .find(['/', '?', '#'])
        .unwrap_or(after_scheme.len());
    let host = &after_scheme[..end];
    if host.is_empty() {
        return None;
    }
    let origin = &url[..url.len() - after_scheme.len() + end];
    let path = after_scheme[end..].split(['?', '#']).next().unwrap_or("");
    let segments = path.split('/').filter(|s| !s.is_empty()).collect();
    Some((origin, host, segments))
}

/// The host without a leading `www.`, lower-cased.
fn site(host: &str) -> String {
    let host = host.to_ascii_lowercase();
    host.strip_prefix("www.").map(str::to_owned).unwrap_or(host)
}

/// The segment after the first `marker` segment, if there is one.
fn after<'a>(segments: &[&'a str], marker: &str) -> Option<&'a str> {
    let at = segments.iter().position(|s| *s == marker)?;
    segments.get(at + 1).copied()
}

/// Read `input` for what it names.
///
/// Recognised, by host and path alone:
///
/// - `github.com/<owner>/<repo>/releases/download/<tag>/<asset>`
/// - `github.com/<owner>/<repo>/releases/latest/download/<asset>`
/// - `<any host>/api/v4/projects/<project>/packages/generic/<package>/<version>/<file>`
///   — GitLab's path is distinctive enough to recognise a self-hosted
///   instance by
/// - `modrinth.com/…/version/<id>`
/// - `curseforge.com/…/files/<id>`
///
/// Any other http(s) URL is a [`Link::Url`]: the address of the file itself.
/// That includes a page on one of these sites that names no file — it is not
/// guessed at, it is fetched, and what comes back is what gets pinned.
pub fn parse_link(input: &str) -> Result<Link, LinkError> {
    let (origin, host, segments) =
        split(input).ok_or_else(|| LinkError::NotAUrl(input.to_owned()))?;
    let decoded = |s: &str| decode_uri_component(s);

    // GitLab first: it is recognised by path, on whatever host.
    if let ["api", "v4", "projects", project, "packages", "generic", package, version, file] =
        segments.as_slice()
    {
        return Ok(Link::GitLab {
            base: origin.to_owned(),
            project: decoded(project),
            package: decoded(package),
            version: decoded(version),
            file: decoded(file),
        });
    }

    match site(host).as_str() {
        "github.com" => match segments.as_slice() {
            [owner, name, "releases", "download", tag, asset] => Ok(Link::GitHub {
                repo: format!("{owner}/{name}"),
                release: GitHubRelease::Tag(decoded(tag)),
                asset: decoded(asset),
            }),
            [owner, name, "releases", "latest", "download", asset] => Ok(Link::GitHub {
                repo: format!("{owner}/{name}"),
                release: GitHubRelease::Latest,
                asset: decoded(asset),
            }),
            _ => Ok(Link::Url(input.to_owned())),
        },
        "modrinth.com" => Ok(match after(&segments, "version") {
            Some(id) => Link::Modrinth {
                version_id: id.to_owned(),
            },
            None => Link::Url(input.to_owned()),
        }),
        "curseforge.com" => Ok(
            match after(&segments, "files").and_then(|id| id.parse().ok()) {
                Some(file_id) => Link::CurseForge { file_id },
                None => Link::Url(input.to_owned()),
            },
        ),
        _ => Ok(Link::Url(input.to_owned())),
    }
}

/// The file name a plain URL ends in, decoded — or the host, for a URL with
/// no path to name it by.
pub(crate) fn url_filename(url: &str) -> String {
    match split(url) {
        Some((_, host, segments)) => segments
            .last()
            .map(|s| decode_uri_component(s))
            .unwrap_or_else(|| host.to_owned()),
        None => url.to_owned(),
    }
}
