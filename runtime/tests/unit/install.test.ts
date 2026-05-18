import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  sourceFile,
  sourcePointer,
  sourceString,
  sourceUrl,
  extractPick,
  type Artifact,
  type Manifest,
} from '@torba/core';
import { install } from '../../lib/install';

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function sha1(content: string): string {
  return createHash('sha1').update(content).digest('hex');
}

function makeManifest(artifacts: Artifact[]): Manifest {
  return { vars: {}, artifacts };
}

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'unipack-install-test-'));
});
afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('install: string source', () => {
  it('writes string to final path', async () => {
    const content = 'hello world';
    const dest = join(tmpDir, 'test.txt');
    const artifact: Artifact = {
      path: dest,
      source: sourceString(content),
      size: content.length,
      rules: [],
    };
    await install(makeManifest([artifact]));
    expect(existsSync(dest)).toBe(true);
    expect(await readFile(dest, 'utf8')).toBe(content);
  });

  it('creates parent dirs', async () => {
    const dest = join(tmpDir, 'a', 'b', 'c', 'file.txt');
    const artifact: Artifact = {
      path: dest,
      source: sourceString('nested'),
      size: 6,
      rules: [],
    };
    await install(makeManifest([artifact]));
    expect(existsSync(dest)).toBe(true);
  });
});

describe('install: integrity', () => {
  it('skips cached file with correct hash', async () => {
    const content = 'cached content';
    const dest = join(tmpDir, 'cached.txt');
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(dest, content);
    let downloadEmitted = false;
    const artifact: Artifact = {
      path: dest,
      source: sourceString(content),
      size: content.length,
      rules: [],
      integrity: { sha1: sha1(content) },
    };
    await install(makeManifest([artifact]), {
      onProgress: (p) => {
        if (p.phase === 'download' && p.fetched > 0) downloadEmitted = true;
      },
    });
    expect(downloadEmitted).toBe(false);
  });

  it('throws on hash mismatch', async () => {
    const dest = join(tmpDir, 'bad.txt');
    const artifact: Artifact = {
      path: dest,
      source: sourceString('content'),
      size: 7,
      rules: [],
      integrity: { sha1: '0000000000000000000000000000000000000000' },
    };
    await expect(install(makeManifest([artifact]))).rejects.toThrow(
      'Integrity check failed',
    );
  });

  it('accepts any hash in multi-hash integrity', async () => {
    const content = 'multi-hash';
    const dest = join(tmpDir, 'multi.txt');
    const artifact: Artifact = {
      path: dest,
      source: sourceString(content),
      size: content.length,
      rules: [],
      integrity: [
        { sha1: '0000000000000000000000000000000000000000' },
        { sha1: sha1(content) },
      ],
    };
    await install(makeManifest([artifact]));
    expect(await readFile(dest, 'utf8')).toBe(content);
  });
});

describe('install: pointer source', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubDescriptor(url: string, body: unknown): void {
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const got = typeof input === 'string' ? input : input.href;
      if (got !== url) return new Response('not found', { status: 404 });
      return new Response(JSON.stringify(body), { status: 200 });
    });
  }

  it('resolves the descriptor and installs the named artifact', async () => {
    const content = 'translation pack v2';
    const dest = join(tmpDir, 'lang.txt');
    stubDescriptor('https://example.com/latest.json', {
      source: { string: content },
      integrity: { sha1: sha1(content) },
    });
    const artifact: Artifact = {
      path: dest,
      source: sourcePointer('https://example.com/latest.json'),
      rules: [],
    };
    let pointerResolved = 0;
    await install(makeManifest([artifact]), {
      onProgress: (p) => {
        if (p.phase === 'pointer') pointerResolved = p.resolved;
      },
    });
    expect(pointerResolved).toBe(1);
    expect(await readFile(dest, 'utf8')).toBe(content);
  });

  it('refetches when the cached copy no longer matches the descriptor', async () => {
    const dest = join(tmpDir, 'lang.txt');
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(dest, 'stale pack v1');
    const fresh = 'fresh pack v2';
    stubDescriptor('https://example.com/latest.json', {
      source: { string: fresh },
      integrity: { sha1: sha1(fresh) },
    });
    const artifact: Artifact = {
      path: dest,
      source: sourcePointer('https://example.com/latest.json'),
      rules: [],
    };
    await install(makeManifest([artifact]));
    expect(await readFile(dest, 'utf8')).toBe(fresh);
  });

  it('keeps the cached copy when the descriptor hash still matches', async () => {
    const dest = join(tmpDir, 'lang.txt');
    const content = 'unchanged pack';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(dest, content);
    stubDescriptor('https://example.com/latest.json', {
      source: { string: content },
      integrity: { sha1: sha1(content) },
    });
    const artifact: Artifact = {
      path: dest,
      source: sourcePointer('https://example.com/latest.json'),
      rules: [],
    };
    let downloaded = 0;
    await install(makeManifest([artifact]), {
      onProgress: (p) => {
        if (p.phase === 'download') downloaded = p.total;
      },
    });
    expect(downloaded).toBe(0);
    expect(await readFile(dest, 'utf8')).toBe(content);
  });
});

describe('install: discovery', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('discovers the hash, downloads, and verifies', async () => {
    const content = 'discovered translation pack';
    const dest = join(tmpDir, 'lang.zip');
    const artifactUrl = 'https://host.example/lang.zip';
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const url = typeof input === 'string' ? input : input.href;
      if (url === `${artifactUrl}.sha256`) {
        return new Response(`${sha256(content)}  lang.zip\n`, { status: 200 });
      }
      if (url === artifactUrl) return new Response(content, { status: 200 });
      return new Response('not found', { status: 404 });
    });
    const artifact: Artifact = {
      path: dest,
      source: sourceUrl(artifactUrl),
      rules: [],
      discovery: { integrity: { url: { sha256: '${url}.sha256' } } },
    };
    await install(makeManifest([artifact]));
    expect(await readFile(dest, 'utf8')).toBe(content);
  });

  it('aborts when the downloaded bytes fail the discovered hash', async () => {
    const dest = join(tmpDir, 'lang.zip');
    const artifactUrl = 'https://host.example/lang.zip';
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const url = typeof input === 'string' ? input : input.href;
      if (url === `${artifactUrl}.sha256`) {
        return new Response(sha256('what was promised'), { status: 200 });
      }
      if (url === artifactUrl) {
        return new Response('something else entirely', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
    const artifact: Artifact = {
      path: dest,
      source: sourceUrl(artifactUrl),
      rules: [],
      discovery: { integrity: { url: { sha256: '${url}.sha256' } } },
    };
    await expect(install(makeManifest([artifact]))).rejects.toThrow(
      'Integrity check failed',
    );
  });
});

describe('install: restrict sweep', () => {
  it('sweeps orphan files and reports the sweep phase', async () => {
    const { mkdir, writeFile: wf } = await import('node:fs/promises');
    const modsDir = join(tmpDir, 'mods');
    await mkdir(modsDir, { recursive: true });
    const orphan = join(modsDir, 'orphan.jar');
    await wf(orphan, 'stale');

    const keep = join(modsDir, 'keep.jar');
    const manifest: Manifest = {
      vars: {},
      artifacts: [{ path: keep, source: sourceString('kept'), rules: [] }],
      restrict: [`${modsDir}/**/*.jar`],
    };
    let swept = 0;
    await install(manifest, {
      onProgress: (p) => {
        if (p.phase === 'sweep') swept = p.removed;
      },
    });
    expect(existsSync(keep)).toBe(true);
    expect(existsSync(orphan)).toBe(false);
    expect(swept).toBe(1);
  });
});

describe('install: extract pending detection', () => {
  it('re-runs a pick extract when its destination is missing', async () => {
    const zip = zipSync({ 'inner/data.txt': strToU8('picked payload') });
    const archive = join(tmpDir, 'archive.zip');
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(archive, zip);
    const dest = join(tmpDir, 'extracted', 'data.txt');

    const artifact: Artifact = {
      path: archive,
      source: sourceFile(archive),
      rules: [],
      extract: [extractPick('inner/data.txt', dest)],
    };
    // archive already on disk → scan skips download; extractIsPending must
    // still schedule the extract because `dest` is absent.
    await install(makeManifest([artifact]));
    expect(await readFile(dest, 'utf8')).toBe('picked payload');
  });
});
