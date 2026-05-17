import { describe, expect, it } from 'vitest';
import type { Artifact } from '../../lib/artifact';
import { sourceUrl } from '../../lib/source';
import { pipe } from '../../lib/pipe';

const artifact = (path: string, extra: Partial<Artifact> = {}): Artifact => ({
  path,
  source: sourceUrl(`https://cdn/${path}`),
  rules: [],
  ...extra,
});

const mods: Artifact[] = [
  artifact('mods/alpha.jar', { integrity: { sha1: 'a' } }),
  artifact('mods/beta.jar', { integrity: { sha1: 'b' } }),
  artifact('config/server.toml'),
];

async function* gen(...items: Artifact[]): AsyncGenerator<Artifact> {
  for (const i of items) yield i;
}

describe('pipe', () => {
  it('drains a plain array unchanged', async () => {
    const out = await pipe(mods).collect();
    expect(out.map((a) => a.path)).toEqual([
      'mods/alpha.jar',
      'mods/beta.jar',
      'config/server.toml',
    ]);
  });

  it('concatenates variadic sources in argument order', async () => {
    const out = await pipe(
      [artifact('a.jar')],
      gen(artifact('b.jar'), artifact('c.jar')),
    ).collect();
    expect(out.map((a) => a.path)).toEqual(['a.jar', 'b.jar', 'c.jar']);
  });

  it('is itself async-iterable', async () => {
    const seen: string[] = [];
    for await (const a of pipe(mods)) seen.push(a.path);
    expect(seen).toEqual(mods.map((a) => a.path));
  });

  it('caches the drain so a single-shot generator re-iterates', async () => {
    const p = pipe(gen(artifact('once.jar')));
    expect((await p.collect()).length).toBe(1);
    expect((await p.collect()).length).toBe(1);
  });
});

describe('exclude', () => {
  it('drops glob-matched artifacts', async () => {
    const out = await pipe(mods).exclude('mods/*.jar').collect();
    expect(out.map((a) => a.path)).toEqual(['config/server.toml']);
  });

  it('accepts an array of globs (OR)', async () => {
    const out = await pipe(mods)
      .exclude(['mods/alpha.jar', 'config/**'])
      .collect();
    expect(out.map((a) => a.path)).toEqual(['mods/beta.jar']);
  });

  it('accepts a predicate', async () => {
    const out = await pipe(mods)
      .exclude((a) => a.path.endsWith('.toml'))
      .collect();
    expect(out.map((a) => a.path)).toEqual(['mods/alpha.jar', 'mods/beta.jar']);
  });

  it('is a silent no-op when nothing matches', async () => {
    const out = await pipe(mods).exclude('**/*.zip').collect();
    expect(out).toHaveLength(3);
  });
});

describe('skipIntegrity', () => {
  it('clears integrity and discovery on matched artifacts only', async () => {
    const src = [
      artifact('mods/alpha.jar', { integrity: { sha1: 'a' } }),
      artifact('mods/beta.jar', {
        discovery: { integrity: { header: { sha256: 'X-Sha' } } },
      }),
      artifact('config/server.toml', { integrity: { sha1: 'c' } }),
    ];
    const out = await pipe(src).skipIntegrity('mods/*.jar').collect();
    expect(out[0]?.integrity).toBeUndefined();
    expect(out[1]?.discovery).toBeUndefined();
    expect(out[2]?.integrity).toEqual({ sha1: 'c' });
  });

  it('does not mutate the source artifacts', async () => {
    const src = [artifact('mods/alpha.jar', { integrity: { sha1: 'a' } })];
    await pipe(src).skipIntegrity('**').collect();
    expect(src[0]?.integrity).toEqual({ sha1: 'a' });
  });
});

describe('chaining', () => {
  it('applies steps in order and keeps the chain immutable', async () => {
    const base = pipe(mods);
    const excluded = base.exclude('config/**');
    // base is untouched by the derived pipe
    expect((await base.collect()).length).toBe(3);

    const out = await excluded.skipIntegrity('mods/alpha.jar').collect();
    expect(out.map((a) => a.path)).toEqual(['mods/alpha.jar', 'mods/beta.jar']);
    expect(out[0]?.integrity).toBeUndefined();
    expect(out[1]?.integrity).toEqual({ sha1: 'b' });
  });
});
