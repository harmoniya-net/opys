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
