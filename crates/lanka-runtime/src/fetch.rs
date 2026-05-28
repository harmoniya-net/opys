//! `fetchWithRetry`-style HTTP client. Bounded retry on transient network
//! failures and 5xx-class responses. Built on `reqwest` (rustls).
//!
//! Mirrors `core/lib/fetch.ts`. Lives in `runtime` rather than `core` because
//! the only consumer is the install pipeline.

use std::sync::OnceLock;
use std::time::Duration;

use rand::Rng;
use reqwest::{Client, Method, Response};

/// `User-Agent` lanka sends with every HTTP request. Some CDNs reject the
/// bare `reqwest` default; CurseForge in particular rate-limits unidentified
/// clients.
pub const LANKA_USER_AGENT: &str = "lanka/1.0";

const DEFAULT_RETRY_STATUSES: &[u16] = &[408, 425, 429, 500, 502, 503, 504];

#[derive(Debug, Clone, Copy)]
pub struct RetryOptions {
    pub attempts: u32,
    pub base_delay_ms: u64,
    pub max_delay_ms: u64,
}

impl Default for RetryOptions {
    fn default() -> Self {
        Self {
            attempts: 4,
            base_delay_ms: 250,
            max_delay_ms: 5_000,
        }
    }
}

pub fn client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .user_agent(LANKA_USER_AGENT)
            .build()
            .expect("reqwest client")
    })
}

fn is_transient_error(err: &reqwest::Error) -> bool {
    err.is_timeout() || err.is_connect() || err.is_request()
}

fn backoff_ms(attempt: u32, base: u64, max: u64) -> u64 {
    let exp = base.saturating_mul(1u64 << (attempt - 1).min(20));
    let capped = exp.min(max);
    let factor: f64 = rand::thread_rng().gen_range(0.5..1.0);
    (capped as f64 * factor) as u64
}

pub async fn fetch_with_retry(
    method: Method,
    url: &str,
    retry: RetryOptions,
) -> Result<Response, reqwest::Error> {
    let mut last_err: Option<reqwest::Error> = None;
    let attempts = retry.attempts.max(1);
    for attempt in 1..=attempts {
        let req = client().request(method.clone(), url).build()?;
        match client().execute(req).await {
            Ok(res) => {
                let status = res.status().as_u16();
                if res.status().is_success()
                    || attempt == attempts
                    || !DEFAULT_RETRY_STATUSES.contains(&status)
                {
                    return Ok(res);
                }
                let delay = backoff_ms(attempt, retry.base_delay_ms, retry.max_delay_ms);
                tokio::time::sleep(Duration::from_millis(delay)).await;
            }
            Err(err) => {
                if !is_transient_error(&err) || attempt == attempts {
                    return Err(err);
                }
                let delay = backoff_ms(attempt, retry.base_delay_ms, retry.max_delay_ms);
                last_err = Some(err);
                tokio::time::sleep(Duration::from_millis(delay)).await;
            }
        }
    }
    Err(last_err.expect("loop returns or sets last_err"))
}

