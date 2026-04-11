import { z } from 'zod';

const HashEntry = z.union([
  z.object({ sha1: z.string() }),
  z.object({ sha256: z.string() }),
]);

export type HashEntry = z.infer<typeof HashEntry>;

// Accept single entry (backward compat), array of entries, or 'skip'
const IntegrityInput = z.union([
  z.literal('skip'),
  HashEntry,
  z.array(HashEntry),
]);

export class Integrity {
  constructor(
    private readonly _entries: HashEntry[],
    private readonly _skip: boolean,
  ) {}

  public static skip(): Integrity {
    return new Integrity([], true);
  }

  public static sha1(hash: string): Integrity {
    return new Integrity([{ sha1: hash }], false);
  }

  public static sha256(hash: string): Integrity {
    return new Integrity([{ sha256: hash }], false);
  }

  /** Create an integrity check that passes if ANY of the given hashes matches. */
  public static of(hashes: HashEntry[]): Integrity {
    return new Integrity(hashes, false);
  }

  public static CODEC = z.codec(IntegrityInput, z.instanceof(Integrity), {
    decode: (val) => {
      if (val === 'skip') return Integrity.skip();
      const arr = Array.isArray(val) ? val : [val];
      return new Integrity(arr, false);
    },
    encode: (integrity) => integrity.toJSON(),
  });

  public isSkip(): boolean {
    return this._skip;
  }

  /** All hash entries. Any one matching a file passes verification. */
  public entries(): HashEntry[] {
    return this._entries;
  }

  /** @deprecated Use {@link entries} + {@link isSkip}. Returns the algorithm of the first entry. */
  public algorithm(): 'sha1' | 'sha256' | 'skip' {
    if (this._skip) return 'skip';
    const first = this._entries[0];
    if (!first) return 'skip';
    return 'sha1' in first ? 'sha1' : 'sha256';
  }

  /** @deprecated Use {@link entries} + {@link isSkip}. Returns the hash of the first entry. */
  public hash(): string | undefined {
    if (this._skip) return undefined;
    const first = this._entries[0];
    if (!first) return undefined;
    return 'sha1' in first ? first.sha1 : first.sha256;
  }

  public toJSON(): z.input<typeof IntegrityInput> {
    if (this._skip) return 'skip';
    if (this._entries.length === 1) return this._entries[0]!; // single entry: backward-compat format
    return this._entries;
  }
}
