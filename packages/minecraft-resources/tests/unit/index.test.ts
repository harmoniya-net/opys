/**
 * The JS half of `@opys/minecraft-resources`: the typed surface and the
 * plugin closures.
 *
 * What an entry is and whom it is asked of is the
 * `opys-minecraft-resources` crate's and is tested there. What is left here
 * is what only exists on this side: that each call reaches the crate, that a
 * file is read by path or URL, and that files are found beside it.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  parseResources,
  readResources,
  resolveResources,
  resources,
} from '../../lib';

const FILE = `
[dirs]
kubejs = "\${game_directory}/kubejs"

[common.mods]
lithium = "modrinth:lithium@0.15.0#fabric"

[client.resourcepacks]
faithful = { source = "modrinth:faithful@1.0", metadata = { optional = true } }

[client.kubejs]
scripts = "file:scripts/"
`;

const version = (id: string, number: string, ext: string) => ({
  id,
  project_id: 'P',
  version_number: number,
  loaders: ['fabric'],
  game_versions: ['1.21.1'],
  files: [
    {
      hashes: { sha1: 'a'.repeat(40) },
      url: `https://cdn.modrinth.test/${id}-${number}.${ext}`,
      filename: `${id}-${number}.${ext}`,
      primary: true,
      size: 10,
    },
  ],
});

/** Modrinth, as far as these tests ask it. */
let modrinth: Server;
let modrinthApi: string;
let configDir: string;

beforeAll(async () => {
  const answers: Record<string, unknown> = {
    '/project/lithium/version?include_changelog=false': [
      version('lith', '0.15.0', 'jar'),
    ],
    '/project/faithful/version?include_changelog=false': [
      version('faith', '1.0', 'zip'),
    ],
  };
  modrinth = createServer((req, res) => {
    const answer = answers[req.url ?? ''];
    res.statusCode = answer ? 200 : 404;
    res.end(JSON.stringify(answer ?? {}));
  });
  await new Promise<void>((done) => modrinth.listen(0, '127.0.0.1', done));
  const { port } = modrinth.address() as AddressInfo;
  modrinthApi = `http://127.0.0.1:${port}`;

  configDir = mkdtempSync(join(tmpdir(), 'opys-resources-'));
  writeFileSync(join(configDir, 'resources.toml'), FILE);
  mkdirSync(join(configDir, 'scripts', 'server'), { recursive: true });
  writeFileSync(join(configDir, 'scripts', 'server', 'a.js'), '// a');
});

afterAll(() => {
  modrinth.close();
});

describe('parseResources', () => {
  it('decodes a file into its directories, per side, by key', () => {
    const file = parseResources(FILE);
    expect(file.dirs).toEqual({ kubejs: '${game_directory}/kubejs' });
    expect(file.common.mods).toEqual({
      lithium: 'modrinth:lithium@0.15.0#fabric',
    });
    // A table where there is more than a source to say.
    expect(file.client.resourcepacks?.faithful).toEqual({
      source: 'modrinth:faithful@1.0',
      metadata: { optional: true },
    });
    expect(file.server).toEqual({});
  });

  it('refuses a table that is no directory, by the name the file was given', () => {
    expect(() =>
      parseResources('[client.textures]\na = "file:a.zip"', 'pack.toml'),
    ).toThrow(/pack\.toml[\s\S]*`textures` is no directory this file knows/);
  });

  it('refuses a source that names no version', () => {
    expect(() =>
      parseResources('[client.mods]\nsodium = "modrinth:sodium"'),
    ).toThrow(/write `modrinth:sodium@<version>`/);
  });
});

describe('readResources', () => {
  it('reads a file by path or by URL, and says where it was', () => {
    const path = join(configDir, 'resources.toml');
    for (const file of [path, pathToFileURL(path)]) {
      const read = readResources(file);
      expect(Object.keys(read.common.mods ?? {})).toEqual(['lithium']);
      expect(read.base).toBe(configDir);
    }
  });

  it('says which file is not there', () => {
    expect(() => readResources('/nowhere/resources.toml')).toThrow(
      /^\/nowhere\/resources\.toml: /,
    );
  });
});

describe('resolveResources', () => {
  it('resolves the side it is given, each file under its key', async () => {
    const files = await resolveResources(
      readResources(join(configDir, 'resources.toml')),
      'client',
      { modrinthApi },
    );
    expect(files.map((file) => [file.dir, file.key, file.path])).toEqual([
      ['mods', 'lithium', 'lithium.jar'],
      ['kubejs', 'scripts', 'scripts/server/a.js'],
      ['resourcepacks', 'faithful', 'faithful.zip'],
    ]);
    expect(files[1]?.source).toEqual({
      file: join(configDir, 'scripts', 'server', 'a.js'),
    });
    expect(files[2]?.metadata).toEqual({ optional: true });
  });
});

describe('resources', () => {
  const ctx = (dir: string) => ({ log: () => {}, configDir: dir, mode: '' });
  const pack = () =>
    resources(readResources(join(configDir, 'resources.toml')), {
      modrinthApi,
    });

  it('is a plugin for each side, both called `resources`, with nothing read', () => {
    const made = resources({
      client: { mods: { missing: 'file:not-there.jar' } },
    });
    expect(made.clientResources().name).toBe('resources');
    expect(made.serverResources().name).toBe('resources');
    // What a list of plugins is told when the call is left off.
    expect(made.clientResources.name).toBe('clientResources');
  });

  it("puts each of the client's in its directory, under its key", async () => {
    // Built elsewhere than the file: `file:` entries are beside the file.
    const built = await pack().clientResources().build(ctx('/elsewhere'));
    expect(built.artifacts?.map((artifact) => artifact.path)).toEqual([
      '${game_directory}/mods/lithium.jar',
      '${game_directory}/kubejs/scripts/server/a.js',
      '${game_directory}/resourcepacks/faithful.zip',
    ]);
    // A file from disk is handed over as itself, for the build to carry.
    expect(built.artifacts?.[1]?.source).toEqual({
      file: join(configDir, 'scripts', 'server', 'a.js'),
    });
    expect(built.artifacts?.[2]).toMatchObject({
      metadata: { optional: true },
    });
  });

  it("puts a server's under its root", async () => {
    const built = await pack().serverResources().build(ctx('/elsewhere'));
    expect(built.artifacts?.map((artifact) => artifact.path)).toEqual([
      '${root}/mods/lithium.jar',
    ]);
  });

  it('takes tables written in the config, with files beside the config', async () => {
    const made = resources({
      dirs: { kubejs: '${game_directory}/kubejs' },
      server: {
        kubejs: {
          startup: {
            source: 'file:scripts/server/a.js',
            metadata: { reload: false },
          },
        },
      },
    });
    const built = await made.serverResources().build(ctx(configDir));
    expect(built.artifacts).toEqual([
      {
        path: '${root}/kubejs/startup.js',
        source: { file: join(configDir, 'scripts', 'server', 'a.js') },
        metadata: { reload: false },
      },
    ]);
    expect(
      (await made.clientResources().build(ctx(configDir))).artifacts,
    ).toEqual([]);
  });

  it('refuses a path, which is what `readResources` takes', () => {
    expect(() =>
      // @ts-expect-error the spelling a guess would make
      resources('resources.toml'),
    ).toThrow(/resources\(readResources\('resources\.toml'\)\)/);
  });

  it('refuses an entry with two sources where it is written', () => {
    resources({
      client: {
        mods: {
          // @ts-expect-error one of `source`, `github` and `gitlab`
          both: { source: 'file:a.jar', github: { repo: 'o/r', tag: 'v1' } },
        },
      },
    });
  });
});
