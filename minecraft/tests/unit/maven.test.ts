import { describe, expect, test } from 'vitest';
import { MavenName, MavenNameSchema } from '../../lib/client/maven';

describe('MavenName', () => {
  const roundtrip = (input: string) => {
    const coord = MavenName.parse(input);
    const output = coord.toString();
    expect(output).toBe(input);
  };

  test('test_display', () => {
    roundtrip('ca.weblite:java-objc-bridge:1.1');
    roundtrip('com.google.guava:guava:31.1-jre');
    roundtrip(
      'io.netty:netty-transport-native-epoll:4.1.82.Final:linux-x86_64',
    );
    roundtrip('org.lwjgl:lwjgl-glfw:3.3.1:natives-linux');
    roundtrip('group:artifact');
    roundtrip('group.id:artifact.id:jar:tests:1.0.0');
  });

  test('test_standard_three_part_coordinates', () => {
    const inputs = [
      'ca.weblite:java-objc-bridge:1.1',
      'com.github.oshi:oshi-core:6.2.2',
      'com.google.guava:guava:31.1-jre',
      'org.apache.commons:commons-lang3:3.12.0',
    ];

    for (const input of inputs) {
      const coord = MavenName.parse(input);
      const parts = input.split(':');

      expect(coord.groupId).toBe(parts[0]!);
      expect(coord.artifactId).toBe(parts[1]!);
      expect(coord.version).toBe(parts[2]);
      expect(coord.packaging).toBeUndefined();
      expect(coord.classifier).toBeUndefined();
    }
  });

  test('test_four_part_coordinates_with_classifiers', () => {
    const inputs = [
      {
        input:
          'io.netty:netty-transport-native-epoll:4.1.82.Final:linux-x86_64',
        expectedClassifier: 'linux-x86_64',
        expectedVersion: '4.1.82.Final',
      },
      {
        input: 'org.lwjgl:lwjgl-glfw:3.3.1:natives-linux',
        expectedClassifier: 'natives-linux',
        expectedVersion: '3.3.1',
      },
    ];

    for (const { input, expectedClassifier, expectedVersion } of inputs) {
      const coord = MavenName.parse(input);

      expect(coord.version).toBe(expectedVersion);
      expect(coord.classifier).toBe(expectedClassifier);
      expect(coord.isNative()).toBe(true);
    }
  });

  test('test_is_native', () => {
    const nativeClassifier = MavenName.parse(
      'org.lwjgl:lwjgl:3.3.1:natives-linux',
    );
    const nativeArtifact = MavenName.parse(
      'io.netty:netty-transport-native-epoll:4.1.82.Final:linux-x86_64',
    );
    const nonNative = MavenName.parse('org.lwjgl:lwjgl:3.3.1');

    expect(nativeClassifier.isNative()).toBe(true);
    expect(nativeArtifact.isNative()).toBe(true);
    expect(nonNative.isNative()).toBe(false);
  });

  test('test_matches_ignoring_version', () => {
    const v1 = MavenName.parse('com.google.guava:guava:31.1-jre');
    const v2 = MavenName.parse('com.google.guava:guava:20.0');
    const other = MavenName.parse('commons-io:commons-io:2.11.0');

    expect(v1.matchesIgnoringVersion(v2)).toBe(true);
    expect(v1.matchesIgnoringVersion(other)).toBe(false);
  });

  test('test_invalid_formats', () => {
    const invalidInputs = [
      '',
      'one-part',
      'one:two:three:four:five:six',
      'too:many:parts:here:to:parse:correctly',
    ];

    for (const input of invalidInputs) {
      expect(() => MavenName.parse(input)).toThrow();
    }
  });

  test('test_edge_cases', () => {
    const emptyVersion = MavenName.parse('group:artifact:');
    expect(emptyVersion.version).toBe('');

    const allEmpty = MavenName.parse('::');
    expect(allEmpty.groupId).toBe('');
    expect(allEmpty.artifactId).toBe('');
    expect(allEmpty.version).toBe('');

    const fiveEmpty = MavenName.parse('::::');
    expect(fiveEmpty.packaging).toBe('');
  });

  test('test_schema_roundtrip', () => {
    const data = new MavenName(
      'org.lwjgl',
      'lwjgl',
      undefined,
      undefined,
      '3.3.1',
    );
    const encoded = MavenNameSchema.encode(data);
    expect(encoded).toBe('org.lwjgl:lwjgl:3.3.1');

    const decoded = MavenNameSchema.decode(encoded);
    expect(decoded).toBeInstanceOf(MavenName);
    expect(decoded.groupId).toBe('org.lwjgl');
    expect(decoded.artifactId).toBe('lwjgl');
    expect(decoded.version).toBe('3.3.1');
  });
});
