/** Maximum simultaneous HTTP connections when none specified by the caller. */
export const DEFAULT_CONCURRENCY = 8;

/** Per-request fetch timeout in milliseconds. */
export const FETCH_TIMEOUT_MS = 30_000;

/** Number of full download→verify cycles before throwing {@link IntegrityError}. */
export const MAX_ATTEMPTS = 3;

/** Per-file HTTP retry attempts within a single download cycle. */
export const DOWNLOAD_RETRIES = 5;

/** Base delay in milliseconds for per-file retry backoff. */
export const RETRY_BASE_MS = 500;

/** Minimum interval between {@link InstallOptions.onProgress} emissions during download. */
export const PROGRESS_THROTTLE_MS = 200;
