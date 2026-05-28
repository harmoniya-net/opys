/**
 * Wrap `fetch()` with bounded retry on transient network failures and
 * 5xx-class responses. Errors that won't recover from a retry (4xx,
 * `AbortError`, JSON parse failures downstream of the response) are
 * surfaced unchanged so callers handle them with their own logic.
 *
 * Network-level retries cover the AggregateError ETIMEDOUT / ECONNRESET
 * / ENOTFOUND / EAI_AGAIN / ECONNREFUSED cases that node:undici reports
 * as `TypeError: fetch failed` with a populated `cause`. Without this
 * one DNS hiccup mid-`opys launch` aborts the whole config evaluation.
 */

/**
 * Default `User-Agent` for every opys HTTP request. The bare `undici`
 * agent gets rejected or rate-limited by some CDNs and by the CurseForge
 * API, so we identify ourselves. The patch component is omitted so the
 * string doesn't churn against `package.json` on every release.
 */
export const OPYS_USER_AGENT = 'opys/1.0';

export interface FetchRetryOptions {
  /** Total attempts including the first. Default 4 (so up to 3 retries). */
  attempts?: number;
  /** Initial delay before retry #2, in ms. Default 250. */
  baseDelayMs?: number;
  /** Cap on per-attempt delay, in ms. Default 5000. */
  maxDelayMs?: number;
  /** HTTP status codes that trigger a retry. Default 408, 425, 429, 500, 502, 503, 504. */
  retryStatuses?: ReadonlySet<number> | readonly number[];
  /** Forward to the underlying `fetch`'s signal — abort cancels remaining retries. */
  signal?: AbortSignal;
  /** Callback for diagnostics / logging on each retry. */
  onRetry?: (info: {
    attempt: number;
    delayMs: number;
    error?: unknown;
    status?: number;
  }) => void;
}

const DEFAULT_RETRY_STATUSES: ReadonlySet<number> = new Set([
  408, 425, 429, 500, 502, 503, 504,
]);

const TRANSIENT_CODES: ReadonlySet<string> = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

function isTransientFetchError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  // Direct undici/Node fetch failure surfaces as `TypeError: fetch failed`
  // with a `cause` carrying the underlying socket error (or AggregateError
  // when Happy Eyeballs raced multiple addresses).
  const cause = (err as { cause?: unknown }).cause;
  if (cause) {
    const code = (cause as { code?: string }).code;
    if (code && TRANSIENT_CODES.has(code)) return true;
    const inner = (cause as { errors?: unknown[] }).errors;
    if (Array.isArray(inner) && inner.length > 0) {
      // AggregateError — retry only if every inner error is transient.
      return inner.every((e) => {
        const c = (e as { code?: string } | undefined)?.code;
        return c !== undefined && TRANSIENT_CODES.has(c);
      });
    }
  }
  const code = (err as { code?: string }).code;
  if (code && TRANSIENT_CODES.has(code)) return true;
  return (
    err instanceof TypeError &&
    typeof (err as Error).message === 'string' &&
    (err as Error).message.toLowerCase().includes('fetch failed')
  );
}

function backoffMs(attempt: number, base: number, max: number): number {
  // Exponential with full jitter — `attempt` is 1-indexed; first retry uses base.
  const exp = base * 2 ** (attempt - 1);
  const capped = Math.min(exp, max);
  return Math.floor(capped * (0.5 + Math.random() * 0.5));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('aborted'));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason ?? new Error('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit = {},
  retry: FetchRetryOptions = {},
): Promise<Response> {
  const attempts = Math.max(1, retry.attempts ?? 4);
  const base = retry.baseDelayMs ?? 250;
  const max = retry.maxDelayMs ?? 5000;
  const retryStatuses =
    retry.retryStatuses instanceof Set
      ? retry.retryStatuses
      : retry.retryStatuses
        ? new Set(retry.retryStatuses)
        : DEFAULT_RETRY_STATUSES;
  const signal = retry.signal ?? init.signal ?? undefined;

  // Default the User-Agent without clobbering a caller-supplied one.
  const headers = new Headers(init.headers);
  if (!headers.has('user-agent')) headers.set('user-agent', OPYS_USER_AGENT);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(input, { ...init, headers, signal });
      if (res.ok || attempt === attempts || !retryStatuses.has(res.status)) {
        return res;
      }
      // Drain so the connection isn't held open across retries.
      try {
        await res.body?.cancel();
      } catch {
        /* ignore */
      }
      const delay = backoffMs(attempt, base, max);
      retry.onRetry?.({ attempt, delayMs: delay, status: res.status });
      await sleep(delay, signal);
    } catch (err) {
      lastErr = err;
      if (signal?.aborted) throw err;
      if (!isTransientFetchError(err) || attempt === attempts) throw err;
      const delay = backoffMs(attempt, base, max);
      retry.onRetry?.({ attempt, delayMs: delay, error: err });
      await sleep(delay, signal);
    }
  }
  // Defensive — the loop always returns or throws above.
  throw lastErr;
}
