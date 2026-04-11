const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Call `fn` up to `maxAttempts` times, sleeping `backoff(attempt)` ms between
 * failures. Re-throws the last error unchanged if all attempts are exhausted.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  backoff: (attempt: number) => number,
  onRetry?: (attempt: number, error: unknown) => void,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts - 1) {
        onRetry?.(attempt + 1, e);
        await sleep(backoff(attempt));
      }
    }
  }
  throw lastErr;
}
