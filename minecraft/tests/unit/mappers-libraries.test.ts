import { describe, expect, it } from 'vitest';
import { libraryToArtifact, mapLibraries } from '../../lib/mappers/libraries';
import { parseLibraries, type Library } from '@lanka/mojang';

const gson = parseLibraries([
  {
    name: 'com.google.code.gson:gson:2.10.1',
    downloads: {
      artifact: {
        path: 'com/google/code/gson/gson/2.10.1/gson-2.10.1.jar',
        sha1: 'b'.repeat(40),
        size: 283367,
        url: 'https://libraries.minecraft.net/gson.jar',
      },
    },
  },
])[0]!;

const lwjglNative = parseLibraries([
  {
    name: 'org.lwjgl:lwjgl:3.3.1',
    downloads: {
      classifiers: {
        'natives-linux': {
          path: 'org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-linux.jar',
          sha1: 'c'.repeat(40),
          size: 78152,
          url: 'https://libraries.minecraft.net/lwjgl-natives-linux.jar',
        },
      },
      natives: { linux: 'natives-linux' },
    },
    natives: { linux: 'natives-linux' },
  },
])[0]!;

describe('libraryToArtifact', () => {
  it('maps a plain library into a url artifact with sha1 integrity', () => {
    const art = libraryToArtifact(gson);
    expect(art.path).toBe(
      '${library_directory}/com/google/code/gson/gson/2.10.1/gson-2.10.1.jar',
    );
    expect(art.source).toEqual({
      kind: 'url',
      url: 'https://libraries.minecraft.net/gson.jar',
    });
    expect(art.size).toBe(283367);
    expect(art.integrity).toEqual({ sha1: 'b'.repeat(40) });
    expect(art.rules).toEqual(gson.rules);
  });

  it('omits an extract rule for non-native libraries', () => {
    expect(libraryToArtifact(gson).extract).toBeUndefined();
  });

  it('adds a dump extract rule for native libraries', () => {
    const art = libraryToArtifact(lwjglNative);
    expect(lwjglNative.native).toBe(true);
    expect(art.extract).toEqual([
      {
        kind: 'dump',
        into: '${natives_directory}',
        excludes: ['META-INF/'],
        clean: true,
      },
    ]);
  });
});

describe('mapLibraries', () => {
  it('maps every library in order', () => {
    const arts = mapLibraries([gson, lwjglNative]);
    expect(arts).toHaveLength(2);
    expect(arts[0]!.path).toContain('gson');
    expect(arts[1]!.path).toContain('lwjgl');
  });

  it('returns an empty list for no libraries', () => {
    expect(mapLibraries([] as readonly Library[])).toEqual([]);
  });
});
