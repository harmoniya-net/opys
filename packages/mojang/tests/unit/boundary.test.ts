/**
 * Boundary tests for the napi wrapper. Parser behaviour itself is covered in
 * Rust (`crates/opys-mojang/tests/`); what matters here is that values cross
 * the boundary with the right shape and that errors still throw.
 */
import { describe, expect, it } from 'vitest';
import {
  parseClient,
  parseLibraries,
  parseArguments,
  parseMaven,
  encodeMaven,
  isNativeMaven,
  assetPath,
  assetUrl,
  parseVersionManifest,
  findVersion,
  latestRelease,
  decodeRuleset,
  satisfiesRuleset,
  allowOsRuleset,
  VERSION_MANIFEST_URL,
  type OsOptions,
} from '../../lib';

const linux: OsOptions = { name: 'linux', version: '6.1', arch: 'x86_64' };

const minimalClient = {
  id: '1.20.1',
  javaVersion: { component: 'java-runtime-gamma', majorVersion: 17 },
  assetIndex: { id: '5', sha1: 'a', size: 1, totalSize: 2, url: 'https://x' },
  downloads: { client: { sha1: 'b', size: 3, url: 'https://y' } },
  mainClass: 'net.minecraft.client.main.Main',
  libraries: [],
  minecraftArguments: '--demo',
  type: 'release',
  time: 't',
  releaseTime: 'rt',
  minimumLauncherVersion: 21,
  assets: '5',
};

describe('parseClient', () => {
  it('returns the camelCase domain shape', () => {
    const c = parseClient(minimalClient);
    expect(c.id).toBe('1.20.1');
    expect(c.java.majorVersion).toBe(17);
    expect(c.assetIndex.totalSize).toBe(2);
    expect(c.metadata.minimumLauncherVersion).toBe(21);
    expect(c.metadata.complianceLevel).toBe(0);
    expect(c.args.legacy).toBe(true);
    expect(c.logging).toBeUndefined();
  });

  it('throws when neither arguments form is present', () => {
    const { minecraftArguments: _, ...noArgs } = minimalClient;
    expect(() => parseClient(noArgs)).toThrow();
  });
});

describe('parseLibraries', () => {
  it('carries rules and the native flag across', () => {
    const libs = parseLibraries([
      {
        name: 'org.lwjgl:lwjgl:3.3.1:natives-linux',
        downloads: {
          artifact: {
            path: 'p.jar',
            sha1: 'c',
            size: 1,
            url: 'https://z',
          },
        },
        rules: [{ action: 'allow', os: { name: 'linux' } }],
      },
    ]);
    expect(libs).toHaveLength(1);
    expect(libs[0]!.native).toBe(true);
    expect(libs[0]!.name.classifier).toBe('natives-linux');
    expect(libs[0]!.rules).toEqual([
      { action: 'allow', os: { name: 'linux' } },
    ]);
  });
});

describe('parseArguments', () => {
  it('keeps a conditional value in its original shape', () => {
    const args = parseArguments({
      game: ['--plain', { rules: [], value: ['--a', '--b'] }],
      jvm: [],
    });
    expect(args.legacy).toBe(false);
    expect(args.game[0]).toBe('--plain');
    expect(args.game[1]).toEqual({ rules: [], value: ['--a', '--b'] });
  });
});

describe('maven', () => {
  it('round-trips through the boundary', () => {
    expect(encodeMaven(parseMaven('org.lwjgl:lwjgl:3.3.1:natives-linux'))).toBe(
      'org.lwjgl:lwjgl:3.3.1:natives-linux',
    );
    expect(isNativeMaven(parseMaven('org.jline:jline-native:3.21.0'))).toBe(
      false,
    );
  });

  it('throws on a malformed coordinate', () => {
    expect(() => parseMaven('one-part')).toThrow();
  });
});

describe('assets', () => {
  it('shards on the first two characters', () => {
    expect(assetPath('3dfaac')).toBe('3d/3dfaac');
    expect(assetUrl('3dfaac')).toContain('/3d/3dfaac');
  });
});

describe('version manifest', () => {
  const manifest = parseVersionManifest({
    latest: { release: '1.20.1', snapshot: '24w01a' },
    versions: [
      {
        id: '1.20.1',
        type: 'release',
        url: 'https://meta/1.20.1.json',
        time: 't',
        releaseTime: 'rt',
        sha1: 'a'.repeat(40),
        complianceLevel: 1,
      },
    ],
  });

  it('points at the v2 manifest', () => {
    expect(VERSION_MANIFEST_URL).toContain('version_manifest_v2.json');
  });

  it('finds by id and resolves latest.release', () => {
    expect(findVersion(manifest, '1.20.1')?.id).toBe('1.20.1');
    expect(findVersion(manifest, 'nope')).toBeUndefined();
    expect(latestRelease(manifest).id).toBe('1.20.1');
  });

  it('rejects a malformed payload', () => {
    expect(() => parseVersionManifest({ bad: true })).toThrow();
  });
});

describe('rules are strict Mojang format', () => {
  it('evaluates an expanded ruleset', () => {
    expect(satisfiesRuleset(allowOsRuleset('linux'), linux)).toBe(true);
    expect(satisfiesRuleset(allowOsRuleset('windows'), linux)).toBe(false);
  });

  it('rejects the opys shorthand spelling', () => {
    // `'allow.os.linux'` is `@opys/core`'s wire sugar, not Mojang's format.
    expect(() => decodeRuleset('allow.os.linux')).toThrow();
    expect(() => decodeRuleset(['allow.os.linux'])).toThrow();
    expect(() =>
      decodeRuleset([{ action: 'allow' }, 'allow.os.linux']),
    ).toThrow();
  });

  it('accepts the expanded form through decodeRuleset', () => {
    expect(decodeRuleset([{ action: 'allow', os: { name: 'osx' } }])).toEqual([
      { action: 'allow', os: { name: 'osx' } },
    ]);
  });
});
