import { z } from 'zod';

export class MavenName {
  constructor(
    public readonly groupId: string,
    public readonly artifactId: string,
    public readonly packaging?: string,
    public readonly classifier?: string,
    public readonly version?: string,
  ) {}

  static parse(value: string): MavenName {
    return MavenNameSchema.decode(value);
  }

  isNative(): boolean {
    return !!(
      this.classifier?.includes('native') || this.artifactId.includes('native')
    );
  }

  matchesIgnoringVersion(other: MavenName): boolean {
    return (
      this.groupId === other.groupId &&
      this.artifactId === other.artifactId &&
      this.packaging === other.packaging &&
      this.classifier === other.classifier
    );
  }

  toString(): string {
    return MavenNameSchema.encode(this);
  }

  toJSON() {
    return this.toString();
  }
}

export const MavenNameSchema = z.codec(z.string(), z.instanceof(MavenName), {
  decode(value: string): MavenName {
    const parts = value.split(':');

    if (parts.length < 2 || parts.length > 5) {
      throw new Error('Invalid Maven coordinate format');
    }

    const groupId = parts[0]!;
    const artifactId = parts[1]!;

    if (parts.length === 2) {
      return new MavenName(groupId, artifactId);
    }

    if (parts.length === 3) {
      return new MavenName(groupId, artifactId, undefined, undefined, parts[2]);
    }

    if (parts.length === 4) {
      return new MavenName(groupId, artifactId, undefined, parts[3], parts[2]);
    }

    return new MavenName(groupId, artifactId, parts[2], parts[3], parts[4]);
  },

  encode(value: MavenName): string {
    let result = `${value.groupId}:${value.artifactId}`;

    if (value.packaging && value.classifier && value.version) {
      result += `:${value.packaging}:${value.classifier}:${value.version}`;
    } else if (!value.packaging && value.classifier && value.version) {
      result += `:${value.version}:${value.classifier}`;
    } else if (!value.packaging && !value.classifier && value.version) {
      result += `:${value.version}`;
    }

    return result;
  },
});

export type MavenNameData = z.infer<typeof MavenNameSchema>;
