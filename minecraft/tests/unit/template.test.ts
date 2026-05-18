import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resolveMinecraft,
  fetchClient,
  clientToTemplate,
} from '../../lib/template';
import { parseClient } from '@torba/mojang';
import {
  ASSET_MANIFEST,
  VERSION_MANIFEST,
  clientJson,
  routedFetch,
  vanillaRoutes,
} from './fixtures';

afterEach(() => vi.unstubAllGlobals());

describe('fetchClient', () => {
  it('resolves the latest release when no version is given', async () => {
    routedFetch(vanillaRoutes('1.20.1'));
    const { version, client } = await fetchClient();
    expect(version.id).toBe('1.20.1');
    expect(client.id).toBe('1.20.1');
  });

  it('resolves a specific version by id', async () => {
    routedFetch([
      ['version_manifest', VERSION_MANIFEST],
      ['/1.12.2.json', clientJson('1.12.2')],
    ]);
    const { version } = await fetchClient('1.12.2');
    expect(version.id).toBe('1.12.2');
  });

  it('throws for an unknown version id', async () => {
    routedFetch([['version_manifest', VERSION_MANIFEST]]);
    await expect(fetchClient('9.9.9')).rejects.toThrow(/not found/);
  });

  it('throws when the version JSON fetch is not ok', async () => {
    routedFetch([
      ['version_manifest', VERSION_MANIFEST],
      ['/1.20.1.json', new Response('gone', { status: 404 })],
    ]);
    await expect(fetchClient('1.20.1')).rejects.toThrow(
      /Failed to fetch version JSON/,
    );
  });
});

describe('clientToTemplate', () => {
  it('assembles artifacts, vars, classpath and launch parts', async () => {
    routedFetch([['/assets/5.json', ASSET_MANIFEST]]);
    const client = parseClient(clientJson());
    const t = await clientToTemplate(client);

    // client.jar + 1 library + asset index + 1 asset object
    expect(t.artifacts).toHaveLength(4);
    expect(t.artifacts.some((a) => a.path.endsWith('client.jar'))).toBe(true);
    expect(t.vars.version_name).toBe('1.20.1');
    expect(t.vars.assets_index_name).toBe('5');
    expect(t.classpath).toHaveLength(3);
    expect(t.launch.command).toBe('${java_bin}');
    expect(t.mainClass.value[0]).toBe('net.minecraft.client.main.Main');
  });

  it('bakes the per-OS classpath into vars.classpath', async () => {
    routedFetch([['/assets/5.json', ASSET_MANIFEST]]);
    const t = await clientToTemplate(parseClient(clientJson()));
    expect(t.vars.classpath).toBe(t.classpath);
  });

  it('threads the version type through to vars', async () => {
    routedFetch([['/assets/5.json', ASSET_MANIFEST]]);
    const t = await clientToTemplate(
      parseClient(clientJson('1.20.1', { type: 'snapshot' })),
    );
    expect(t.vars.version_type).toBe('snapshot');
  });

  it('emits classpath_separator with three OS arms', async () => {
    routedFetch([['/assets/5.json', ASSET_MANIFEST]]);
    const t = await clientToTemplate(parseClient(clientJson()));
    expect(t.vars.classpath_separator).toHaveLength(3);
  });
});

describe('resolveMinecraft', () => {
  it('resolveMinecraft with a version pins that version', async () => {
    routedFetch([
      ['version_manifest', VERSION_MANIFEST],
      ['/1.20.1.json', clientJson('1.20.1')],
      ['/assets/5.json', ASSET_MANIFEST],
    ]);
    const t = await resolveMinecraft({ version: '1.20.1' });
    expect(t.vars.version_name).toBe('1.20.1');
  });

  it('resolveMinecraft with no config resolves the latest', async () => {
    routedFetch(vanillaRoutes());
    const t = await resolveMinecraft();
    expect(t.vars.version_name).toBe('1.20.1');
  });

  it('resolves a template end-to-end', async () => {
    routedFetch(vanillaRoutes());
    const t = await resolveMinecraft({ version: '1.20.1' });
    expect(t.artifacts.length).toBeGreaterThan(0);
    expect(t.launch.args.length).toBeGreaterThan(0);
  });
});
