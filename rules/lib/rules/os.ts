import { z } from 'zod';
import type { SatisfiesOsOptions } from './satisfies';

export enum RuleOsName {
  Linux = 'linux',
  Windows = 'windows',
  Osx = 'osx',
}

export const RuleOsNameSchema = z.enum(RuleOsName);

export enum RuleOsArch {
  X86 = 'x86',
  X86_64 = 'x86_64',
  ARM = 'arm',
  AARCH64 = 'aarch64',
  ANY = 'any',
}

export const RuleOsArchSchema = z.enum(RuleOsArch);

export const RuleOsSchema = z.union([
  z.object({ name: z.enum(RuleOsName), version: z.string() }),
  z.object({ name: z.enum(RuleOsName) }),
  z.object({ arch: z.enum(RuleOsArch) }),
]);

export class RuleOs {
  constructor(private readonly inner: z.infer<typeof RuleOsSchema>) {}

  public static CODEC = z.codec(RuleOsSchema, z.instanceof(RuleOs), {
    decode: (os) => new RuleOs(os),
    encode: (os) => os.toJSON(),
  });

  public satisfies(options: SatisfiesOsOptions): boolean {
    if ('name' in this.inner && 'version' in this.inner) {
      try {
        return (
          this.inner.name === options.name &&
          new RegExp(this.inner.version).test(options.version)
        );
      } catch (e) {
        throw new Error(
          `Invalid OS version pattern "${this.inner.version}": ${e}`,
        );
      }
    }
    if ('name' in this.inner) {
      return this.inner.name === options.name;
    }
    if ('arch' in this.inner) {
      return this.inner.arch === options.arch;
    }
    return false;
  }

  public toJSON() {
    return this.inner;
  }
}
