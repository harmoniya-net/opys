//! Build-time HTTP.
//!
//! One blocking GET against a shared agent. No retry, no streaming, no
//! resume, no download bookkeeping — deliberately. Resolvers run once, at
//! build time, against small JSON APIs; the install path has its own
//! downloader in `opys-runtime` and must never reach for this.

use std::sync::OnceLock;

/// A completed response. The body is read eagerly: build-time payloads are
/// JSON documents measured in kilobytes, so there is nothing to stream.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HttpResponse {
    pub status: u16,
    pub body: String,
}

impl HttpResponse {
    /// 2xx. A non-2xx status is data, not an error — resolvers soft-skip a
    /// 404 for a platform a release doesn't ship.
    pub fn ok(&self) -> bool {
        (200..300).contains(&self.status)
    }
}

/// Transport failure — DNS, TLS, connect, or a body that isn't UTF-8. An
/// HTTP status is *not* one of these; it comes back in [`HttpResponse`].
#[derive(Debug, thiserror::Error)]
#[error("GET {url} failed: {reason}")]
pub struct HttpError {
    pub url: String,
    pub reason: String,
}

/// Identify ourselves: the bare agent string gets rejected or rate-limited by
/// some CDNs and by the CurseForge API. The patch component is omitted so the
/// string doesn't churn against the version on every release. Mirrors
/// `@opys/core`'s `OPYS_USER_AGENT`.
pub const OPYS_USER_AGENT: &str = "opys/1.0";

/// Ceiling on a response body. GitHub's `releases?per_page=100` is the
/// largest document any resolver asks for and lands well under this; the cap
/// exists so a misrouted request can't exhaust memory.
const BODY_LIMIT: u64 = 32 * 1024 * 1024;

/// One agent for the whole build — it owns the connection pool, so sharing it
/// is what lets the per-platform fan-out reuse TLS sessions.
fn agent() -> &'static ureq::Agent {
    static AGENT: OnceLock<ureq::Agent> = OnceLock::new();
    AGENT.get_or_init(|| {
        ureq::Agent::config_builder()
            .user_agent(OPYS_USER_AGENT)
            // A 404 is an answer, not a transport failure — resolvers branch
            // on the status themselves.
            .http_status_as_error(false)
            .build()
            .into()
    })
}

/// GET `url` and read the whole body. Blocking: build-time resolvers are
/// plain synchronous functions, parallelised with `std::thread::scope` when
/// they need it.
pub fn get(url: &str, headers: &[(&str, &str)]) -> Result<HttpResponse, HttpError> {
    let fail = |e: &dyn std::fmt::Display| HttpError {
        url: url.to_owned(),
        reason: e.to_string(),
    };
    let mut req = agent().get(url);
    for (name, value) in headers {
        req = req.header(*name, *value);
    }
    let mut res = req.call().map_err(|e| fail(&e))?;
    let status = res.status().as_u16();
    let body = res
        .body_mut()
        .with_config()
        .limit(BODY_LIMIT)
        .read_to_string()
        .map_err(|e| fail(&e))?;
    Ok(HttpResponse { status, body })
}

/// A build-time JSON GET that failed: the transport did, the server answered
/// with a non-2xx, or the body was not the document expected.
///
/// Kept apart from [`HttpError`] because [`get`] deliberately treats a status
/// as data — a resolver soft-skips a 404 for a platform a release doesn't
/// ship. [`get_json`] is the other half of that split: the callers who want a
/// document and have nothing to do with a status that isn't 200.
#[derive(Debug, thiserror::Error)]
pub enum JsonGetError {
    #[error(transparent)]
    Transport(#[from] HttpError),
    #[error("{url} returned HTTP {status}")]
    Status { url: String, status: u16 },
    #[error(transparent)]
    Decode(#[from] serde_json::Error),
}

/// GET `url` and parse the body as `T`.
///
/// Every loader resolver starts here — a small JSON API, one request, no
/// retry. Shared so that the status check and the decode have one spelling
/// across the family rather than one per crate.
pub fn get_json<T: serde::de::DeserializeOwned>(
    url: &str,
    headers: &[(&str, &str)],
) -> Result<T, JsonGetError> {
    let response = get(url, headers)?;
    if !response.ok() {
        return Err(JsonGetError::Status {
            url: url.to_owned(),
            status: response.status,
        });
    }
    Ok(serde_json::from_str(&response.body)?)
}
