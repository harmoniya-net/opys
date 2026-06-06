import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveNeoForgeVersion, nfVersionToMc } from '../../lib/resolver';

afterEach(() => vi.unstubAllGlobals());

const SOURCE = 'https://neoforge.test/releases';

const MAVEN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<metadata>
  <groupId>net.neoforged</groupId>
  <artifactId>neoforge</artifactId>
  <versioning>
    <release>21.1.172</release>
    <versions>
      <version>20.2.3-beta</version>
      <version>20.4.80-beta</version>
      <version>20.4.100-beta</version>
      <version>21.0.5</version>
      <version>21.1.100</version>
      <version>21.1.172</version>
    </versions>
  </versioning>
</metadata>`;

function mockFetch(
  routes: Array<[match: string, body: string | Response]>,
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (url: string) => {
    for (const [match, body] of routes) {
      if (url.includes(match)) {
        return body instanceof Response ? body.clone() : new Response(body);
      }
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('nfVersionToMc', () => {
  it('maps a two-part MC version', () => {
    expect(nfVersionToMc('20.4.80-beta')).toBe('1.20.4');
  });

  it('maps a two-part MC version without qualifier', () => {
    expect(nfVersionToMc('21.1.172')).toBe('1.21.1');
  });

  it('maps a single-minor MC version (minor = 0)', () => {
    expect(nfVersionToMc('21.0.5')).toBe('1.21');
  });

  it('throws on an unparseable version string', () => {
    expect(() => nfVersionToMc('garbage')).toThrow(
      /Cannot parse NeoForge version string/,
    );
  });
});

describe('resolveNeoForgeVersion', () => {
  it('resolves a bare NeoForge version without fetching Maven XML', async () => {
    const fn = mockFetch([]);
    const r = await resolveNeoForgeVersion('20.4.80-beta', SOURCE);
    expect(r.version).toBe('20.4.80-beta');
    expect(r.mcVersion).toBe('1.20.4');
    expect(r.installerUrl).toContain('20.4.80-beta-installer.jar');
    expect(r.sha1Url).toBe(`${r.installerUrl}.sha1`);
    expect(fn).not.toHaveBeenCalled();
  });

  it('resolves a bare MC version to the latest NeoForge', async () => {
    mockFetch([['maven-metadata.xml', MAVEN_XML]]);
    const r = await resolveNeoForgeVersion('1.20.4', SOURCE);
    // 20.4.100-beta is newest for 1.20.4 (listed after 20.4.80-beta in XML)
    expect(r.version).toBe('20.4.100-beta');
    expect(r.mcVersion).toBe('1.20.4');
  });

  it('resolves a -latest alias the same as a bare MC version', async () => {
    mockFetch([['maven-metadata.xml', MAVEN_XML]]);
    const r = await resolveNeoForgeVersion('1.21.1-latest', SOURCE);
    expect(r.version).toBe('21.1.172');
    expect(r.mcVersion).toBe('1.21.1');
  });

  it('strips trailing slashes from the source base', async () => {
    const fn = mockFetch([['maven-metadata.xml', MAVEN_XML]]);
    await resolveNeoForgeVersion('1.20.4', `${SOURCE}///`);
    expect(fn.mock.calls[0]![0]).toBe(
      `${SOURCE}/net/neoforged/neoforge/maven-metadata.xml`,
    );
  });

  it('resolves a single-minor MC version (minor = 0)', async () => {
    mockFetch([['maven-metadata.xml', MAVEN_XML]]);
    const r = await resolveNeoForgeVersion('1.21', SOURCE);
    expect(r.version).toBe('21.0.5');
    expect(r.mcVersion).toBe('1.21');
  });

  it('throws when no NeoForge build exists for the MC version', async () => {
    mockFetch([['maven-metadata.xml', MAVEN_XML]]);
    await expect(resolveNeoForgeVersion('1.99.99', SOURCE)).rejects.toThrow(
      /No NeoForge version found for Minecraft/,
    );
  });

  it('throws when the Maven metadata fetch fails', async () => {
    mockFetch([
      ['maven-metadata.xml', new Response('forbidden', { status: 403 })],
    ]);
    await expect(resolveNeoForgeVersion('1.20.4', SOURCE)).rejects.toThrow(
      /→ 403/,
    );
  });
});
