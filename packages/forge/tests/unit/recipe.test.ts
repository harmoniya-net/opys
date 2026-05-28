import { describe, expect, it } from 'vitest';
import { parseForgeRecipe } from '../../lib/recipe';

const universalCoord = 'net.minecraftforge:forge:1.12.2-14.23.5.2860';

function legacyRaw(libraries: unknown[] = []) {
  return {
    type: 'legacy',
    forge: '1.12.2-14.23.5.2860',
    id: '1.12.2',
    mainClass: 'net.minecraft.launchwrapper.Launch',
    minecraftArguments: '--username ${auth_player_name} --version forge',
    libraries,
  };
}

function processorRaw() {
  return {
    type: 'processor',
    forge: '1.20.1-47.4.20',
    id: '1.20.1',
    mainClass: 'cpw.mods.bootstraplauncher.BootstrapLauncher',
    arguments: {
      game: ['--launchTarget', 'forgeclient'],
      jvm: ['-p', '${library_directory}/foo.jar'],
    },
    libraries: [
      {
        name: 'net.minecraftforge:forge:1.20.1-47.4.20',
        downloads: {
          artifact: {
            path: 'net/minecraftforge/forge/1.20.1-47.4.20/forge.jar',
            sha1: 'a'.repeat(40),
            size: 100,
            url: 'https://maven/forge.jar',
          },
        },
      },
    ],
  };
}

describe('parseForgeRecipe — legacy', () => {
  it('parses a legacy recipe into the legacy kind', () => {
    const r = parseForgeRecipe(legacyRaw());
    expect(r.kind).toBe('legacy');
    if (r.kind !== 'legacy') throw new Error('wrong kind');
    expect(r.forge).toBe('1.12.2-14.23.5.2860');
    expect(r.id).toBe('1.12.2');
    expect(r.mainClass).toBe('net.minecraft.launchwrapper.Launch');
    expect(r.args.legacy).toBe(true);
  });

  it('parses legacy libraries that carry their own URL', () => {
    const r = parseForgeRecipe(
      legacyRaw([
        {
          name: 'org.ow2.asm:asm:5.2',
          downloads: {
            artifact: {
              path: 'org/ow2/asm/asm/5.2/asm-5.2.jar',
              url: 'https://maven/asm.jar',
              sha1: 'b'.repeat(40),
              size: 50,
            },
          },
        },
      ]),
    );
    if (r.kind !== 'legacy') throw new Error('wrong kind');
    expect(r.libraries).toHaveLength(1);
    expect(r.libraries[0]).toMatchObject({
      name: 'org.ow2.asm:asm:5.2',
      url: 'https://maven/asm.jar',
      sha1: 'b'.repeat(40),
      size: 50,
    });
  });

  it('skips a legacy library entry with no downloads.artifact', () => {
    const r = parseForgeRecipe(
      legacyRaw([{ name: 'no.artifact:lib:1', downloads: {} }]),
    );
    if (r.kind !== 'legacy') throw new Error('wrong kind');
    expect(r.libraries).toHaveLength(0);
  });

  it('splices forgeUniversal url+md5 onto the universal placeholder', () => {
    const r = parseForgeRecipe(
      legacyRaw([
        {
          name: universalCoord,
          downloads: {
            artifact: {
              path: 'net/minecraftforge/forge/forge-universal.jar',
            },
          },
        },
      ]),
      {
        forgeUniversal: {
          url: 'https://fuckforge/universal.jar',
          md5: 'deadbeef',
        },
      },
    );
    if (r.kind !== 'legacy') throw new Error('wrong kind');
    expect(r.libraries[0]).toMatchObject({
      url: 'https://fuckforge/universal.jar',
      md5: 'deadbeef',
    });
  });

  it('throws when a legacy library has no URL and no fallback', () => {
    expect(() =>
      parseForgeRecipe(
        legacyRaw([
          {
            name: 'some:lib:1',
            downloads: { artifact: { path: 'some/lib.jar' } },
          },
        ]),
      ),
    ).toThrow(/has no URL and no fallback/);
  });

  it('does not apply md5 to non-universal libraries', () => {
    const r = parseForgeRecipe(
      legacyRaw([
        {
          name: 'other:lib:1',
          downloads: {
            artifact: { path: 'other/lib.jar', url: 'https://maven/o.jar' },
          },
        },
      ]),
      { forgeUniversal: { url: 'https://x', md5: 'abc' } },
    );
    if (r.kind !== 'legacy') throw new Error('wrong kind');
    expect(r.libraries[0]!.md5).toBeUndefined();
  });
});

describe('parseForgeRecipe — processor', () => {
  it('parses a processor recipe into the processor kind', () => {
    const r = parseForgeRecipe(processorRaw());
    expect(r.kind).toBe('processor');
    if (r.kind !== 'processor') throw new Error('wrong kind');
    expect(r.forge).toBe('1.20.1-47.4.20');
    expect(r.mainClass).toBe('cpw.mods.bootstraplauncher.BootstrapLauncher');
    expect(r.args.legacy).toBe(false);
    expect(r.args.game).toContain('--launchTarget');
    expect(r.libraries).toHaveLength(1);
  });
});

describe('parseForgeRecipe — unsupported', () => {
  it('parses a jarmod recipe into the unsupported kind', () => {
    const r = parseForgeRecipe({
      type: 'jarmod',
      forge: '1.5.2-7.8.1',
      id: '1.5.2',
    });
    expect(r.kind).toBe('unsupported');
    if (r.kind !== 'unsupported') throw new Error('wrong kind');
    expect(r.type).toBe('jarmod');
  });

  it('parses an ancient recipe into the unsupported kind', () => {
    const r = parseForgeRecipe({
      type: 'ancient',
      forge: '1.4.7',
      id: '1.4.7',
    });
    if (r.kind !== 'unsupported') throw new Error('wrong kind');
    expect(r.type).toBe('ancient');
  });

  it('rejects an unknown recipe type', () => {
    expect(() =>
      parseForgeRecipe({ type: 'mystery', forge: 'x', id: 'y' }),
    ).toThrow();
  });
});
