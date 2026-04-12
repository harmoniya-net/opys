import { describe, expect, test } from 'vitest';
import { parseLibraries } from '../../lib/client/libraries';

describe('parseLibraries', () => {
  test('simple library without natives', () => {
    const libs = parseLibraries([
      {
        name: 'com.google.code.gson:gson:2.10.1',
        downloads: {
          artifact: {
            path: 'com/google/code/gson/gson/2.10.1/gson-2.10.1.jar',
            sha1: 'b0632cd551fd3e1088a002ad589255074ea0151f',
            size: 283367,
            url: 'https://libraries.minecraft.net/com/google/code/gson/gson/2.10.1/gson-2.10.1.jar',
          },
        },
      },
    ]);
    expect(libs).toHaveLength(1);
    expect(libs[0]!.name.toString()).toBe('com.google.code.gson:gson:2.10.1');
    expect(libs[0]!.rules).toHaveLength(0);
    expect(libs[0]!.native).toBe(false);
  });

  test('library with native classifiers produces one entry per classifier', () => {
    const libs = parseLibraries([
      {
        name: 'org.lwjgl:lwjgl:3.3.1',
        downloads: {
          artifact: {
            path: 'org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1.jar',
            sha1: 'ae30432a096c6e7582cd21e3309e365859345ed6',
            size: 301540,
            url: 'https://libraries.minecraft.net/org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1.jar',
          },
          classifiers: {
            'natives-linux': {
              path: 'org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-linux.jar',
              sha1: '3dfaac0d31cf26733989c9354964646700810777',
              size: 78152,
              url: 'https://libraries.minecraft.net/org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-linux.jar',
            },
            'natives-windows': {
              path: 'org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-windows.jar',
              sha1: '5261175659cb4a92da6ce7a988d447d377b25203',
              size: 257766,
              url: 'https://libraries.minecraft.net/org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-windows.jar',
            },
          },
          natives: { linux: 'natives-linux', windows: 'natives-windows' },
        },
        natives: { linux: 'natives-linux', windows: 'natives-windows' },
      },
    ]);
    // 1 main artifact + 2 native classifiers
    expect(libs).toHaveLength(3);

    const main = libs.find((l) => l.rules.length === 0);
    expect(main).toBeDefined();
    expect(main!.native).toBe(false);

    const linuxNative = libs.find(
      (l) =>
        l.rules.length === 1 &&
        'os' in l.rules[0]! &&
        (l.rules[0] as { action: string; os: { name?: string } }).os.name ===
          'linux',
    );
    expect(linuxNative).toBeDefined();
    expect(linuxNative!.native).toBe(true);
  });

  test('arch replacement in classifier key', () => {
    const libs = parseLibraries([
      {
        name: 'ca.weblite:java-objc-bridge:1.1',
        downloads: {
          classifiers: {
            'natives-osx-64': {
              path: 'ca/weblite/java-objc-bridge/1.1/java-objc-bridge-1.1-natives-osx-64.jar',
              sha1: '043fba15f9b4c0926d25f77839358249a1d49ba8',
              size: 5800,
              url: 'https://libraries.minecraft.net/ca/weblite/java-objc-bridge/1.1/java-objc-bridge-1.1-natives-osx-64.jar',
            },
          },
        },
        natives: { osx: 'natives-osx-{arch}' },
      },
    ]);
    expect(libs).toHaveLength(1);
    expect(libs[0]!.artifact.path).toContain('natives-osx-64');
  });
});
