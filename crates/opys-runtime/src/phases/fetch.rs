use base64::Engine;
use futures::StreamExt;
use indexmap::IndexMap;
use std::path::Path;
use std::sync::Arc;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use tokio::task::JoinSet;
use tokio_util::sync::CancellationToken;
use opys_core::{interpolate, Artifact, Source};

use crate::errors::InstallError;
use crate::fetch::{client, OPYS_USER_AGENT};

pub struct FetchTask {
    pub artifact: Artifact,
    pub final_path: String,
}

type FetchStartHook = Arc<dyn Fn(&FetchTask) + Send + Sync>;
type FetchBytesHook = Arc<dyn Fn(&FetchTask, u64) + Send + Sync>;
type FetchDoneHook = Arc<dyn Fn(&FetchTask) + Send + Sync>;

#[derive(Clone, Default)]
pub struct FetchHooks {
    pub on_start: Option<FetchStartHook>,
    pub on_bytes: Option<FetchBytesHook>,
    pub on_done: Option<FetchDoneHook>,
}

const RETRY_DELAYS_MS: &[u64] = &[500, 2_000, 8_000];

async fn fetch_once(
    task: &FetchTask,
    vars: &IndexMap<String, String>,
    on_bytes: &(dyn Fn(u64) + Send + Sync),
) -> Result<(), InstallError> {
    let final_path = Path::new(&task.final_path);
    if let Some(parent) = final_path.parent() {
        fs::create_dir_all(parent).await.map_err(|source| InstallError::Io {
            path: parent.display().to_string(),
            source,
        })?;
    }
    let tmp_path = format!("{}.partial", task.final_path);

    match &task.artifact.source {
        Source::Url { url } => {
            let url = interpolate(url, vars);
            let res = client()
                .get(&url)
                .header("user-agent", OPYS_USER_AGENT)
                .send()
                .await
                .map_err(|e| InstallError::Network {
                    url: url.clone(),
                    status: 0,
                    body: e.to_string(),
                })?;
            let status = res.status();
            if !status.is_success() {
                let body = res.text().await.unwrap_or_default();
                return Err(InstallError::Network {
                    url,
                    status: status.as_u16(),
                    body,
                });
            }
            let mut file = fs::File::create(&tmp_path).await.map_err(|source| {
                InstallError::Io {
                    path: tmp_path.clone(),
                    source,
                }
            })?;
            let mut total: u64 = 0;
            let mut stream = res.bytes_stream();
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|e| InstallError::Network {
                    url: url.clone(),
                    status: 0,
                    body: e.to_string(),
                })?;
                file.write_all(&chunk).await.map_err(|source| InstallError::Io {
                    path: tmp_path.clone(),
                    source,
                })?;
                total += chunk.len() as u64;
                on_bytes(total);
            }
            file.flush().await.ok();
        }
        Source::File { file: path } => {
            let resolved = interpolate(path, vars);
            let data = fs::read(&resolved).await.map_err(|source| InstallError::Io {
                path: resolved.clone(),
                source,
            })?;
            let len = data.len() as u64;
            fs::write(&tmp_path, &data).await.map_err(|source| InstallError::Io {
                path: tmp_path.clone(),
                source,
            })?;
            on_bytes(len);
        }
        Source::String { string } => {
            let bytes = string.as_bytes();
            fs::write(&tmp_path, bytes).await.map_err(|source| InstallError::Io {
                path: tmp_path.clone(),
                source,
            })?;
            on_bytes(bytes.len() as u64);
        }
        Source::Bytes { bytes } => {
            let decoded = base64::engine::general_purpose::STANDARD
                .decode(bytes)
                .map_err(|e| InstallError::other(format!("bad base64: {e}")))?;
            let len = decoded.len() as u64;
            fs::write(&tmp_path, &decoded).await.map_err(|source| InstallError::Io {
                path: tmp_path.clone(),
                source,
            })?;
            on_bytes(len);
        }
        Source::Pointer { .. } => {
            // Pointer sources should be resolved before scan/fetch.
            return Err(InstallError::other(format!(
                "Unsupported source for {}",
                task.artifact.path
            )));
        }
    }

    fs::rename(&tmp_path, &task.final_path)
        .await
        .map_err(|source| InstallError::Io {
            path: tmp_path,
            source,
        })?;
    Ok(())
}

async fn fetch_one(
    task: &FetchTask,
    vars: &IndexMap<String, String>,
    on_bytes: &(dyn Fn(u64) + Send + Sync),
) -> Result<(), InstallError> {
    let mut attempt = 0usize;
    loop {
        match fetch_once(task, vars, on_bytes).await {
            Ok(()) => return Ok(()),
            Err(err) => {
                let _ = fs::remove_file(format!("{}.partial", task.final_path)).await;
                if attempt >= RETRY_DELAYS_MS.len() {
                    return Err(err);
                }
                tokio::time::sleep(std::time::Duration::from_millis(RETRY_DELAYS_MS[attempt]))
                    .await;
                attempt += 1;
            }
        }
    }
}

/// Size → concurrency weight. Buckets match the TS version: small=1, med=2,
/// large=4, huge=8 (alone at the default budget).
fn weight(size: Option<u64>) -> u32 {
    let Some(size) = size else { return 1 };
    const MB: u64 = 1024 * 1024;
    if size < MB {
        1
    } else if size < 10 * MB {
        2
    } else if size < 50 * MB {
        4
    } else {
        8
    }
}

/// Weighted-budget semaphore: admits any waiter whose weight currently fits,
/// in arrival order. Skipping a too-big head to admit a smaller follower
/// avoids head-of-line blocking on the LPT-sorted queue.
struct Budget {
    state: Mutex<BudgetState>,
}

struct BudgetState {
    cap: u32,
    used: u32,
    waiters: Vec<Waiter>,
}

struct Waiter {
    need: u32,
    tx: tokio::sync::oneshot::Sender<()>,
}

impl Budget {
    fn new(cap: u32) -> Self {
        Self {
            state: Mutex::new(BudgetState {
                cap: cap.max(1),
                used: 0,
                waiters: Vec::new(),
            }),
        }
    }

    async fn acquire(&self, amount: u32) {
        let rx = {
            let mut state = self.state.lock().await;
            let need = amount.min(state.cap);
            if state.used + need <= state.cap {
                state.used += need;
                return;
            }
            let (tx, rx) = tokio::sync::oneshot::channel();
            state.waiters.push(Waiter { need, tx });
            rx
        };
        rx.await.ok();
    }

    async fn release(&self, amount: u32) {
        let mut state = self.state.lock().await;
        let need = amount.min(state.cap);
        state.used = state.used.saturating_sub(need);
        let mut i = 0;
        while i < state.waiters.len() {
            let cap = state.cap;
            let used = state.used;
            let need = state.waiters[i].need;
            if used + need <= cap {
                let w = state.waiters.remove(i);
                state.used += w.need;
                let _ = w.tx.send(());
            } else {
                i += 1;
            }
        }
    }
}

pub async fn fetch_all(
    mut tasks: Vec<FetchTask>,
    vars: &IndexMap<String, String>,
    concurrency: u32,
    hooks: FetchHooks,
    cancel: &CancellationToken,
) -> Result<(), InstallError> {
    // Largest-first.
    tasks.sort_by(|a, b| b.artifact.size.unwrap_or(0).cmp(&a.artifact.size.unwrap_or(0)));

    let budget = Arc::new(Budget::new(concurrency));
    let vars = Arc::new(vars.clone());

    // A JoinSet (not bare `tokio::spawn`) so that returning early — on error or
    // cancellation — drops the set and aborts every still-running download.
    // Detached `tokio::spawn` tasks would instead keep running in the background.
    let mut set: JoinSet<Result<(), InstallError>> = JoinSet::new();
    for task in tasks {
        let budget = Arc::clone(&budget);
        let vars = Arc::clone(&vars);
        let hooks = hooks.clone();
        let task = Arc::new(task);
        set.spawn(async move {
            let w = weight(task.artifact.size);
            budget.acquire(w).await;
            let res: Result<(), InstallError> = async {
                if let Some(h) = &hooks.on_start {
                    h(&task);
                }
                let t = Arc::clone(&task);
                let hooks_inner = hooks.clone();
                fetch_one(&task, &vars, &|n| {
                    if let Some(h) = &hooks_inner.on_bytes {
                        h(&t, n);
                    }
                })
                .await?;
                if let Some(h) = &hooks.on_done {
                    h(&task);
                }
                Ok(())
            }
            .await;
            budget.release(w).await;
            res
        });
    }

    loop {
        tokio::select! {
            // Bias the cancel check so a pending cancellation always wins over a
            // ready download result.
            biased;
            _ = cancel.cancelled() => return Err(InstallError::Cancelled),
            joined = set.join_next() => match joined {
                None => return Ok(()),
                Some(Ok(Ok(()))) => {}
                Some(Ok(Err(e))) => return Err(e),
                Some(Err(e)) => return Err(InstallError::other(format!("join error: {e}"))),
            },
        }
    }
}
