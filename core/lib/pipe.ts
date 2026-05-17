import type { Artifact } from './artifact';
import type { ArtifactIterable } from './config';
import { globToRegex } from './glob';

/**
 * Targets a subset of artifacts for a `pipe` op:
 *
 * - `string` / `string[]` — glob(s) matched against `artifact.path`
 *   (multiple = OR). `${var}` segments in a path are literal, so target by
 *   suffix with a leading double-star; a bare `**` matches everything.
 * - predicate — `(a) => boolean`, the escape hatch for anything a glob
 *   can't express (source kind, size, metadata, …).
 */
export type Selector = string | string[] | ((artifact: Artifact) => boolean);

function toPredicate(selector: Selector): (a: Artifact) => boolean {
  if (typeof selector === 'function') return selector;
  const globs = (Array.isArray(selector) ? selector : [selector]).map(
    globToRegex,
  );
  return (a) => globs.some((re) => re.test(a.path));
}

/** A recorded, pure `Artifact[] → Artifact[]` transform step. */
type Step = (artifacts: Artifact[]) => Artifact[];

async function drainAll(sources: ArtifactIterable[]): Promise<Artifact[]> {
  const out: Artifact[] = [];
  for (const src of sources) {
    for await (const a of src) out.push(a);
  }
  return out;
}

/**
 * A composable, re-iterable view over one or more artifact sources. Built
 * by {@link pipe}. Each method records a pure synchronous transform and
 * returns a *new* `ArtifactPipe` — the chain is immutable.
 *
 * The result is both an `AsyncIterable<Artifact>` — so it drops straight
 * into a config's `artifacts: [...]` with no `await` — and exposes
 * {@link collect} for when a materialized `Artifact[]` is needed. Sources
 * are drained exactly once (cached), so single-shot async generators are
 * safe across repeated iteration.
 */
export class ArtifactPipe implements AsyncIterable<Artifact> {
  private constructor(
    /** Memoized drain of the underlying sources, shared by every derived pipe. */
    private readonly drained: () => Promise<Artifact[]>,
    private readonly steps: readonly Step[],
  ) {}

  /** @internal — use {@link pipe}. */
  static from(sources: ArtifactIterable[]): ArtifactPipe {
    let cache: Promise<Artifact[]> | undefined;
    return new ArtifactPipe(() => (cache ??= drainAll(sources)), []);
  }

  private with(step: Step): ArtifactPipe {
    return new ArtifactPipe(this.drained, [...this.steps, step]);
  }

  /** Drop every artifact the selector matches. */
  exclude(selector: Selector): ArtifactPipe {
    const hit = toPredicate(selector);
    return this.with((arts) => arts.filter((a) => !hit(a)));
  }

  /**
   * Disable hash verification for matched artifacts — clears both
   * `integrity` and `discovery` (discovery exists only to *produce* an
   * install-time hash, so skipping the check has to drop both).
   */
  skipIntegrity(selector: Selector): ArtifactPipe {
    const hit = toPredicate(selector);
    return this.with((arts) =>
      arts.map((a) =>
        hit(a) ? { ...a, integrity: undefined, discovery: undefined } : a,
      ),
    );
  }

  /** Materialize the pipeline to a plain array. */
  async collect(): Promise<Artifact[]> {
    let arts = await this.drained();
    for (const step of this.steps) arts = step(arts);
    return arts;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Artifact> {
    yield* await this.collect();
  }
}

/**
 * Open an {@link ArtifactPipe} over one or more artifact sources. Sources
 * are concatenated in argument order — preserving the build's in-order,
 * last-wins-by-`path` dedup — then narrowed/rewritten by chained ops:
 *
 * ```js
 * artifacts: [
 *   pipe(mc.artifacts, fr.artifacts, artifactScanner({ ... }))
 *     .exclude('**\/realms*.jar')
 *     .skipIntegrity('**\/mods/*.jar'),
 * ];
 * ```
 */
export function pipe(...sources: ArtifactIterable[]): ArtifactPipe {
  return ArtifactPipe.from(sources);
}
