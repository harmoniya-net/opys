import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveForgeVersion } from '../../lib/forge/resolver';

afterEach(() => vi.unstubAllGlobals());

const SOURCE = 'https://fuckforge.test';

function entry(forge: string, url: string) {
  return { forge, url };
}

const master = {
  versions: {
    '1.20.1': {
      latest: entry('1.20.1-47.4.0', `${SOURCE}/v/1.20.1/47.4.0.json`),
      recommended: entry('1.20.1-47.2.0', `${SOURCE}/v/1.20.1/47.2.0.json`),
      best: entry('1.20.1-47.4.20', `${SOURCE}/v/1.20.1/47.4.20.json`),
      list: [
        entry('1.20.1-47.4.20', `${SOURCE}/v/1.20.1/47.4.20.json`),
        entry('1.20.1-47.1.0', `${SOURCE}/v/1.20.1/47.1.0.json`),
      ],
    },
    '1.12.2': {
      latest: null,
      recommended: null,
      best: entry('1.12.2-14.23.5.2860', `${SOURCE}/v/1.12.2/best.json`),
      list: [entry('1.12.2-14.23.5.2860', `${SOURCE}/v/1.12.2/best.json`)],
    },
  },
};

function buildEntry(forge: string) {
  return { id: '1.20.1', forge, files: {}, manifest: null, recipe: null };
}

/** Mock fetch dispatching by URL substring. */
function mockFetch(routes: Record<string, unknown>) {
  const fn = vi.fn(async (url: string) => {
    for (const [key, body] of Object.entries(routes)) {
      if (url.includes(key)) return new Response(JSON.stringify(body));
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('resolveForgeVersion', () => {
  it('resolves a bare MC version to the best build', async () => {
    mockFetch({
      'versions.json': master,
      '47.4.20.json': buildEntry('1.20.1-47.4.20'),
    });
    const e = await resolveForgeVersion('1.20.1', SOURCE);
    expect(e.forge).toBe('1.20.1-47.4.20');
  });

  it('strips trailing slashes from the source base', async () => {
    const fn = mockFetch({
      'versions.json': master,
      '47.4.20.json': buildEntry('1.20.1-47.4.20'),
    });
    await resolveForgeVersion('1.20.1', `${SOURCE}///`);
    expect(fn.mock.calls[0]![0]).toBe(`${SOURCE}/versions.json`);
  });

  it('resolves a -latest alias', async () => {
    mockFetch({
      'versions.json': master,
      '47.4.0.json': buildEntry('1.20.1-47.4.0'),
    });
    const e = await resolveForgeVersion('1.20.1-latest', SOURCE);
    expect(e.forge).toBe('1.20.1-47.4.0');
  });

  it('resolves a -recommended alias', async () => {
    mockFetch({
      'versions.json': master,
      '47.2.0.json': buildEntry('1.20.1-47.2.0'),
    });
    const e = await resolveForgeVersion('1.20.1-recommended', SOURCE);
    expect(e.forge).toBe('1.20.1-47.2.0');
  });

  it('resolves a -best alias', async () => {
    mockFetch({
      'versions.json': master,
      '47.4.20.json': buildEntry('1.20.1-47.4.20'),
    });
    const e = await resolveForgeVersion('1.20.1-best', SOURCE);
    expect(e.forge).toBe('1.20.1-47.4.20');
  });

  it('resolves a full Forge build ID via the list', async () => {
    mockFetch({
      'versions.json': master,
      '47.1.0.json': buildEntry('1.20.1-47.1.0'),
    });
    const e = await resolveForgeVersion('1.20.1-47.1.0', SOURCE);
    expect(e.forge).toBe('1.20.1-47.1.0');
  });

  it('throws on an alias for an unknown MC version', async () => {
    mockFetch({ 'versions.json': master });
    await expect(resolveForgeVersion('9.9.9-latest', SOURCE)).rejects.toThrow(
      /Unknown Minecraft version/,
    );
  });

  it('throws when an alias build is unavailable for the MC version', async () => {
    mockFetch({ 'versions.json': master });
    await expect(resolveForgeVersion('1.12.2-latest', SOURCE)).rejects.toThrow(
      /No 'latest' Forge build/,
    );
  });

  it('throws when a full build ID is not in any list', async () => {
    mockFetch({ 'versions.json': master });
    await expect(
      resolveForgeVersion('1.20.1-99.99.99', SOURCE),
    ).rejects.toThrow(/Could not resolve Forge version/);
  });

  it('throws when the version cannot be matched at all', async () => {
    mockFetch({ 'versions.json': master });
    await expect(resolveForgeVersion('garbage', SOURCE)).rejects.toThrow(
      /Could not resolve Forge version/,
    );
  });

  it('throws on a non-ok master index response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('boom', { status: 403 })),
    );
    await expect(resolveForgeVersion('1.20.1', SOURCE)).rejects.toThrow(
      /→ 403/,
    );
  });

  it('throws on a non-ok per-build entry response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('versions.json')
          ? new Response(JSON.stringify(master))
          : new Response('gone', { status: 404 }),
      ),
    );
    await expect(resolveForgeVersion('1.20.1', SOURCE)).rejects.toThrow(
      /→ 404/,
    );
  });
});
