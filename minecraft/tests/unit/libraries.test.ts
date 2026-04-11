import { describe, expect, test } from 'vitest';
import { Libraries } from '../../lib/client/libraries';
import { RuleOsName } from '@unifest/rules';

describe('Libraries', () => {
  test('test_decode_simple_library', () => {
    const raw = [
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
    ];

    const libs = Libraries.CODEC.decode(raw);
    const arr = Array.from(libs);
    expect(arr).toHaveLength(1);
    expect(arr[0]!.name.toString()).toBe('com.google.code.gson:gson:2.10.1');
    expect(arr[0]!.artifact.path).toBe(
      'com/google/code/gson/gson/2.10.1/gson-2.10.1.jar',
    );
    expect(arr[0]!.rules).toHaveLength(0);
    expect(arr[0]!.native).toBe(false);
  });

  test('test_decode_library_with_natives', () => {
    const raw = [
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
            'natives-osx': {
              path: 'org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-osx.jar',
              sha1: '028198f16182390823521d0353063f272a2e1d08',
              size: 34509,
              url: 'https://libraries.minecraft.net/org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-osx.jar',
            },
          },
        },
        natives: {
          linux: 'natives-linux',
          windows: 'natives-windows',
          osx: 'natives-osx',
        },
      },
    ];

    const libs = Libraries.CODEC.decode(raw);
    const arr = Array.from(libs);
    // 1 main artifact + 3 native classifiers = 4
    expect(arr).toHaveLength(4);

    const main = arr.find((l) => l.rules.length === 0);
    expect(main).toBeDefined();
    expect(main!.artifact.path).toBe('org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1.jar');

    const linux = arr.find((l) => {
      const rules = Array.from(l.rules);
      return (
        rules.length === 1 &&
        (rules[0] as any).inner.os?.inner.name === RuleOsName.Linux
      );
    });
    expect(linux).toBeDefined();
    expect(linux!.artifact.path).toBe(
      'org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-linux.jar',
    );
  });

  test('test_arch_replacement', () => {
    const raw = [
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
        natives: {
          osx: 'natives-osx-{arch}',
        },
      },
    ];

    const libs = Libraries.CODEC.decode(raw);
    const arr = Array.from(libs);
    expect(arr).toHaveLength(1);
    expect(arr[0]!.artifact.path).toContain('natives-osx-64');
  });
});
