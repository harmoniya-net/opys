import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry, LANKA_USER_AGENT } from '../../lib/fetch';

afterEach(() => vi.unstubAllGlobals());

/** Tight delays so retry tests don't actually wait. */
const fast = { baseDelayMs: 1, maxDelayMs: 2 } as const;

const res = (status: number, body = 'x') => new Response(body, { status });

const transient = (code: string) => {
  const err = new TypeError('fetch failed');
  (err as { cause?: unknown }).cause = { code };
  return err;
};

describe('LANKA_USER_AGENT', () => {
  it('is a non-empty identifying string', () => {
    expect(LANKA_USER_AGENT).toMatch(/^lanka\//);
  });
});

describe('fetchWithRetry', () => {
  it('returns a successful response on the first attempt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200));
    vi.stubGlobal('fetch', fetchMock);
    const r = await fetchWithRetry('https://x');
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('defaults the User-Agent header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200));
    vi.stubGlobal('fetch', fetchMock);
    await fetchWithRetry('https://x');
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('user-agent')).toBe(LANKA_USER_AGENT);
  });

  it('does not clobber a caller-supplied User-Agent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200));
    vi.stubGlobal('fetch', fetchMock);
    await fetchWithRetry('https://x', {
      headers: { 'user-agent': 'custom/9' },
    });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('user-agent')).toBe('custom/9');
  });

  it('retries a retryable 5xx status then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(503))
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', fetchMock);
    const r = await fetchWithRetry('https://x', {}, fast);
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns the last response when status retries are exhausted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(503));
    vi.stubGlobal('fetch', fetchMock);
    const r = await fetchWithRetry('https://x', {}, { ...fast, attempts: 3 });
    expect(r.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('clamps attempts to at least one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(503));
    vi.stubGlobal('fetch', fetchMock);
    await fetchWithRetry('https://x', {}, { ...fast, attempts: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a non-retryable 4xx status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(404));
    vi.stubGlobal('fetch', fetchMock);
    const r = await fetchWithRetry('https://x', {}, fast);
    expect(r.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a transient network error then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(transient('ECONNRESET'))
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', fetchMock);
    const r = await fetchWithRetry('https://x', {}, fast);
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rethrows a non-transient error without retrying', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('boom'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchWithRetry('https://x', {}, fast)).rejects.toThrow('boom');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws the transient error when retries are exhausted', async () => {
    const fetchMock = vi.fn().mockRejectedValue(transient('ETIMEDOUT'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      fetchWithRetry('https://x', {}, { ...fast, attempts: 2 }),
    ).rejects.toThrow('fetch failed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('detects a transient error via a top-level error code', async () => {
    const err = Object.assign(new Error('socket'), { code: 'UND_ERR_SOCKET' });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', fetchMock);
    const r = await fetchWithRetry('https://x', {}, fast);
    expect(r.status).toBe(200);
  });

  it('treats a bare "fetch failed" TypeError as transient', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', fetchMock);
    const r = await fetchWithRetry('https://x', {}, fast);
    expect(r.status).toBe(200);
  });

  it('retries an AggregateError when every inner error is transient', async () => {
    const agg = new TypeError('fetch failed');
    (agg as { cause?: unknown }).cause = {
      errors: [{ code: 'ECONNRESET' }, { code: 'EAI_AGAIN' }],
    };
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(agg)
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', fetchMock);
    const r = await fetchWithRetry('https://x', {}, fast);
    expect(r.status).toBe(200);
  });

  it('does not retry an AggregateError with a non-transient inner error', async () => {
    const agg = new TypeError('fetch failed');
    (agg as { cause?: unknown }).cause = {
      errors: [{ code: 'ECONNRESET' }, { code: 'EPERM' }],
    };
    const fetchMock = vi.fn().mockRejectedValue(agg);
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchWithRetry('https://x', {}, fast)).rejects.toBe(agg);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('honors a custom retryStatuses array', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(418))
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', fetchMock);
    const r = await fetchWithRetry(
      'https://x',
      {},
      { ...fast, retryStatuses: [418] },
    );
    expect(r.status).toBe(200);
  });

  it('honors a custom retryStatuses Set', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(500))
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', fetchMock);
    const r = await fetchWithRetry(
      'https://x',
      {},
      { ...fast, retryStatuses: new Set([500]) },
    );
    expect(r.status).toBe(200);
  });

  it('invokes onRetry with attempt and status', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(503))
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', fetchMock);
    const onRetry = vi.fn();
    await fetchWithRetry('https://x', {}, { ...fast, onRetry });
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, status: 503 }),
    );
  });

  it('invokes onRetry with the error on a transient failure', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(transient('ECONNREFUSED'))
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', fetchMock);
    const onRetry = vi.fn();
    await fetchWithRetry('https://x', {}, { ...fast, onRetry });
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, error: expect.any(TypeError) }),
    );
  });

  it('forwards the init signal to fetch when retry omits it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200));
    vi.stubGlobal('fetch', fetchMock);
    const ctrl = new AbortController();
    await fetchWithRetry('https://x', { signal: ctrl.signal });
    expect((fetchMock.mock.calls[0]![1] as RequestInit).signal).toBe(
      ctrl.signal,
    );
  });

  it('stops before sleeping when the signal is already aborted', async () => {
    const ctrl = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(res(503));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      fetchWithRetry(
        'https://x',
        {},
        { ...fast, signal: ctrl.signal, onRetry: () => ctrl.abort() },
      ),
    ).rejects.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rethrows immediately when the signal aborts during a rejection', async () => {
    const ctrl = new AbortController();
    const fetchMock = vi.fn().mockImplementation(() => {
      ctrl.abort();
      return Promise.reject(transient('ECONNRESET'));
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      fetchWithRetry('https://x', {}, { ...fast, signal: ctrl.signal }),
    ).rejects.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending retry delay when aborted mid-wait', async () => {
    const ctrl = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(res(503));
    vi.stubGlobal('fetch', fetchMock);
    const p = fetchWithRetry(
      'https://x',
      {},
      { baseDelayMs: 10_000, maxDelayMs: 10_000, signal: ctrl.signal },
    );
    await new Promise((r) => setTimeout(r, 20));
    ctrl.abort();
    await expect(p).rejects.toBeDefined();
  });
});
