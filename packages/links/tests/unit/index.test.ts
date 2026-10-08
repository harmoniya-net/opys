/**
 * The JS half of `@opys/links`.
 *
 * Reading a link and asking its provider are the `opys-links` crate's and are
 * tested there, provider by provider. What is tested here is what only exists
 * on this side: the `path` callback (called once per file, in order, with the
 * resolved file), that the options cross under their camelCase names, and
 * that the plugin logs and returns what it gets back.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { BuildContext } from '@opys/dev';
import {
  links,
  resolveLinkArtifacts,
  resolveLinks,
  type ResolvedFile,
} from '../../lib/index';

const SHA256_OF_HELLO =
  '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';

/** Stands in for GitHub's API, Modrinth's, and a plain file host. */
let server: Server;
let base: string;
let requests: { target: string; auth?: string }[];

beforeEach(async () => {
  requests = [];
  server = createServer((req, res) => {
    const target = req.url ?? '';
    const auth = req.headers.authorization;
    requests.push({
      target,
      auth: typeof auth === 'string' ? auth : undefined,
    });

    if (target === '/files/hello.txt') {
      res.writeHead(200).end('hello');
      return;
    }
    const body = target.startsWith('/repos/o/r/releases/tags/1.0')
      ? {
          tag_name: '1.0',
          prerelease: false,
          draft: false,
          published_at: '2026-01-01T00:00:00Z',
          assets: [
            {
              name: 'tool.jar',
              size: 4242,
              browser_download_url: `${base}/dl/tool.jar`,
              digest: `sha256:${'a'.repeat(64)}`,
            },
          ],
        }
      : target.startsWith('/versions?')
        ? [
            {
              id: 'MMM',
              project_id: 'P',
              version_number: '1',
              files: [
                {
                  filename: 'sodium.jar',
                  url: 'https://cdn.modrinth.test/sodium.jar',
                  primary: true,
                  size: 77,
                  hashes: { sha1: 'e'.repeat(40) },
                },
              ],
            },
          ]
        : undefined;
    if (body === undefined) {
      res.writeHead(404).end('unrouted');
      return;
    }
    res
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

const GITHUB = 'https://github.com/o/r/releases/download/1.0/tool.jar';
const MODRINTH = 'https://modrinth.com/mod/sodium/version/MMM';
const options = () => ({ githubApi: base, modrinthApi: base });

function makeCtx() {
  const logs: { scope: string; message: string }[] = [];
  const ctx: BuildContext = {
    log: (scope, message) => logs.push({ scope, message }),
    configDir: '/tmp',
    mode: '',
  };
  return { ctx, logs };
}

describe('resolveLinks', () => {
  it('resolves each link through its provider, in order', async () => {
    const plain = `${base}/files/hello.txt`;
    const files = await resolveLinks([MODRINTH, plain, GITHUB], options());

    expect(files).toEqual([
      {
        link: MODRINTH,
        provider: 'modrinth',
        filename: 'sodium.jar',
        url: 'https://cdn.modrinth.test/sodium.jar',
        size: 77,
        integrity: { sha1: 'e'.repeat(40) },
      },
      {
        link: plain,
        provider: 'url',
        filename: 'hello.txt',
        url: plain,
        size: 5,
        integrity: { sha256: SHA256_OF_HELLO },
      },
      {
        link: GITHUB,
        provider: 'github',
        filename: 'tool.jar',
        url: `${base}/dl/tool.jar`,
        size: 4242,
        integrity: { sha256: 'a'.repeat(64) },
      },
    ]);
  });

  it('carries a token across under its camelCase name', async () => {
    await resolveLinks([GITHUB], { ...options(), githubToken: 'ghp_test' });
    expect(requests[0]!.auth).toBe('Bearer ghp_test');
  });

  it('rejects with the crate’s error for something that is no link', async () => {
    await expect(resolveLinks(['sodium'], options())).rejects.toThrow(
      /"sodium" is not a link/,
    );
    expect(requests).toEqual([]);
  });

  it('asks for a key when a CurseForge link has none', async () => {
    await expect(
      resolveLinks(
        ['https://www.curseforge.com/minecraft/mc-mods/a/files/111'],
        options(),
      ),
    ).rejects.toThrow(/curseforgeToken/);
  });
});

describe('resolveLinkArtifacts', () => {
  it('asks the author where each file goes, once each and in order', async () => {
    const seen: ResolvedFile[] = [];
    const artifacts = await resolveLinkArtifacts([GITHUB, MODRINTH], {
      ...options(),
      to: (file) => {
        seen.push(file);
        return `\${game_directory}/${file.provider}/${file.filename}`;
      },
    });

    expect(seen.map((f) => f.filename)).toEqual(['tool.jar', 'sodium.jar']);
    expect(artifacts).toEqual([
      {
        path: '${game_directory}/github/tool.jar',
        source: { url: `${base}/dl/tool.jar` },
        size: 4242,
        integrity: { sha256: 'a'.repeat(64) },
      },
      {
        path: '${game_directory}/modrinth/sodium.jar',
        source: { url: 'https://cdn.modrinth.test/sodium.jar' },
        size: 77,
        integrity: { sha1: 'e'.repeat(40) },
      },
    ]);
  });
});

describe('links()', () => {
  it('is pure to construct, then logs a count and contributes artifacts', async () => {
    const plugin = links({
      ...options(),
      to: (file) => `mods/${file.filename}`,
      links: [MODRINTH],
    });
    expect(plugin.name).toBe('links');
    expect(requests).toEqual([]);

    const { ctx, logs } = makeCtx();
    const contribution = await plugin.build(ctx);
    expect(logs).toEqual([{ scope: 'links', message: '1 file(s)' }]);
    expect(contribution.artifacts!.map((a) => a.path)).toEqual([
      'mods/sodium.jar',
    ]);
  });
});
