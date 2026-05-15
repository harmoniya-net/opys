import { describe, expect, test } from 'vitest';
import {
  MavenName,
  MavenNameSchema,
  parseMaven,
  encodeMaven,
  isNativeMaven,
} from '../../lib/client/maven';

describe('parseMaven / encodeMaven', () => {
  const roundtrip = (input: string) => {
    expect(encodeMaven(parseMaven(input))).toBe(input);
  };

  test('standard three-part roundtrips', () => {
    roundtrip('ca.weblite:java-objc-bridge:1.1');
    roundtrip('com.google.guava:guava:31.1-jre');
    roundtrip('group:artifact');
  });

  test('four-part with classifier', () => {
    roundtrip(
      'io.netty:netty-transport-native-epoll:4.1.82.Final:linux-x86_64',
    );
    roundtrip('org.lwjgl:lwjgl-glfw:3.3.1:natives-linux');
  });

  test('five-part full coordinates', () => {
    roundtrip('group.id:artifact.id:jar:tests:1.0.0');
  });

  test('fields are correct', () => {
    const c = parseMaven('com.google.guava:guava:31.1-jre');
    expect(c.groupId).toBe('com.google.guava');
    expect(c.artifactId).toBe('guava');
    expect(c.version).toBe('31.1-jre');
    expect(c.packaging).toBeUndefined();
    expect(c.classifier).toBeUndefined();
  });

  test('isNativeMaven', () => {
    expect(
      isNativeMaven(parseMaven('org.lwjgl:lwjgl:3.3.1:natives-linux')),
    ).toBe(true);
    expect(isNativeMaven(parseMaven('org.lwjgl:lwjgl:3.3.1'))).toBe(false);
    // Non-native libraries with "native" in the artifactId must not be
    // classified as natives — otherwise their whole jar gets dumped into
    // the natives directory and wipes real LWJGL .so files.
    expect(
      isNativeMaven(
        parseMaven('io.netty:netty-transport-native-unix-common:4.1.97.Final'),
      ),
    ).toBe(false);
    expect(isNativeMaven(parseMaven('org.jline:jline-native:3.21.0'))).toBe(
      false,
    );
  });

  test('invalid format throws', () => {
    expect(() => parseMaven('')).toThrow();
    expect(() => parseMaven('one-part')).toThrow();
    expect(() => parseMaven('a:b:c:d:e:f')).toThrow();
  });
});

describe('MavenName class (backward compat)', () => {
  test('parse and toString roundtrip', () => {
    const m = MavenName.parse('org.lwjgl:lwjgl:3.3.1');
    expect(m.toString()).toBe('org.lwjgl:lwjgl:3.3.1');
    expect(m).toBeInstanceOf(MavenName);
  });

  test('MavenNameSchema decode', () => {
    const m = MavenNameSchema.parse('org.lwjgl:lwjgl:3.3.1');
    expect(m).toBeInstanceOf(MavenName);
    expect(m.groupId).toBe('org.lwjgl');
  });
});
