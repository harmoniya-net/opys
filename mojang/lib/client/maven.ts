import { z } from 'zod';

export interface MavenCoord {
  readonly groupId: string;
  readonly artifactId: string;
  readonly version?: string;
  readonly classifier?: string;
  readonly packaging?: string;
}

/** Parse a Maven coordinate string into a {@link MavenCoord}. */
export function parseMaven(value: string): MavenCoord {
  const parts = value.split(':');
  if (parts.length < 2 || parts.length > 5) {
    throw new Error(`Invalid Maven coordinate: "${value}"`);
  }
  const groupId = parts[0]!;
  const artifactId = parts[1]!;
  if (parts.length === 2) return { groupId, artifactId };
  if (parts.length === 3) return { groupId, artifactId, version: parts[2] };
  if (parts.length === 4)
    return { groupId, artifactId, version: parts[2], classifier: parts[3] };
  return {
    groupId,
    artifactId,
    packaging: parts[2],
    classifier: parts[3],
    version: parts[4],
  };
}

/** Encode a {@link MavenCoord} back to its canonical string form. */
export function encodeMaven(c: MavenCoord): string {
  let result = `${c.groupId}:${c.artifactId}`;
  if (c.packaging && c.classifier && c.version) {
    result += `:${c.packaging}:${c.classifier}:${c.version}`;
  } else if (!c.packaging && c.classifier && c.version) {
    result += `:${c.version}:${c.classifier}`;
  } else if (!c.packaging && !c.classifier && c.version !== undefined) {
    result += `:${c.version}`;
  }
  return result;
}

export function isNativeMaven(c: MavenCoord): boolean {
  return !!c.classifier?.startsWith('natives');
}

/** Compare two coordinates on every field except {@link MavenCoord.version}. */
export function mavenMatchesIgnoringVersion(
  a: MavenCoord,
  b: MavenCoord,
): boolean {
  return (
    a.groupId === b.groupId &&
    a.artifactId === b.artifactId &&
    a.packaging === b.packaging &&
    a.classifier === b.classifier
  );
}

/** Zod schema decoding a Maven coordinate string into a {@link MavenCoord}. */
export const MavenCoordSchema = z.string().transform(parseMaven);
