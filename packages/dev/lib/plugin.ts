import type { Artifact, ValDefs, Val, Valset } from '@opys/core';
import { parseShortRuleset } from '@opys/core';
import { matchesSelector, type RulesetInput, type Selector } from './selector';

/** Build-time context handed to every plugin's `build` hook. */
export interface BuildContext {
  /** Sanctioned build-time logging channel; auto-prefixed by plugin name. */
  log: (scope: string, message: string) => void;
  /** Absolute directory of `opys.config.mjs` — anchor for relative paths. */
  configDir: string;
  /** Value of `opys build --mode <m>`; empty string when unset. */
  mode: string;
}

/**
 * Named launch fragments a plugin exposes for the config's `command`/`args`
 * accessor functions — e.g. `{ jvmArgs, mainClass, gameArgs }` or `{ bin }`.
 */
export type LaunchGroups = Record<string, Valset | Val | string>;

/** What a plugin's `build` hook returns. */
export interface Contribution {
  /** Artifacts to download/copy/extract. */
  artifacts?: Artifact[];
  /** Manifest vars this plugin owns. */
  vars?: ValDefs;
  /** Named launch fragments, exposed to the config's accessor functions. */
  launch?: LaunchGroups;
}

/**
 * A opys plugin — a pure-to-construct, bundler-style hook object. The
 * constructor (`forge('1.20.1-best')`, …) does zero I/O; all network/fs work
 * happens inside `build`, which the engine drives.
 */
export interface OpysPlugin {
  name: string;
  build(ctx: BuildContext): Promise<Contribution> | Contribution;
}

/**
 * The patch passed to `updateFirst` / `updateMany` — either a literal partial
 * artifact, or a function of the matched artifact (to derive a field from the
 * current value, e.g. a mirror URL off the existing path).
 */
export type ArtifactPatch =
  | Partial<Artifact>
  | ((artifact: Artifact) => Partial<Artifact>);

/**
 * A plugin you can post-process fluently. Every method returns a **new** plugin
 * with one more artifact transform appended — pure, so the original is
 * untouched and chains read left-to-right. Transforms rewrite `artifacts` only;
 * `vars` / `launch` pass through. The engine sees only `name` / `build`.
 */
export interface ChainablePlugin extends OpysPlugin {
  /** Drop every artifact matching `match`. */
  exclude(match: Selector): ChainablePlugin;
  /**
   * Append a ruleset (shorthand `'allow.os.osx'` or a full `Ruleset`) to each
   * matched artifact's existing `rules`.
   */
  addRule(match: Selector, rules: RulesetInput): ChainablePlugin;
  /**
   * Clear `integrity` **and** `discovery` on matched artifacts — the latter so
   * the runtime doesn't re-derive a hash at install and verify anyway.
   */
  removeIntegrity(match: Selector): ChainablePlugin;
  /** Shallow-merge a patch into the first matching artifact (input order). */
  updateFirst(match: Selector, patch: ArtifactPatch): ChainablePlugin;
  /** Shallow-merge a patch into every matching artifact. */
  updateMany(match: Selector, patch: ArtifactPatch): ChainablePlugin;
}

/** A pure artifact-list rewrite accumulated by one fluent call. */
type Transform = (artifacts: Artifact[]) => Artifact[];

const merge = (artifact: Artifact, patch: ArtifactPatch): Artifact => ({
  ...artifact,
  ...(typeof patch === 'function' ? patch(artifact) : patch),
});

function chainable(
  base: OpysPlugin,
  transforms: readonly Transform[],
): ChainablePlugin {
  const push = (t: Transform) => chainable(base, [...transforms, t]);
  const mapMatched =
    (match: Selector, f: (a: Artifact) => Artifact): Transform =>
    (arts) =>
      arts.map((a) => (matchesSelector(match, a) ? f(a) : a));

  return {
    name: base.name,
    async build(ctx) {
      const contribution = await base.build(ctx);
      if (contribution.artifacts === undefined) return contribution;
      const artifacts = transforms.reduce(
        (arts, t) => t(arts),
        contribution.artifacts,
      );
      return { ...contribution, artifacts };
    },
    exclude: (match) =>
      push((arts) => arts.filter((a) => !matchesSelector(match, a))),
    addRule: (match, rules) =>
      push(
        mapMatched(match, (a) => ({
          ...a,
          rules: [...a.rules, ...parseShortRuleset(rules)],
        })),
      ),
    removeIntegrity: (match) =>
      push(
        mapMatched(match, (a) => ({
          ...a,
          integrity: undefined,
          discovery: undefined,
        })),
      ),
    updateMany: (match, patch) =>
      push(mapMatched(match, (a) => merge(a, patch))),
    updateFirst: (match, patch) =>
      push((arts) => {
        let done = false;
        return arts.map((a) => {
          if (done || !matchesSelector(match, a)) return a;
          done = true;
          return merge(a, patch);
        });
      }),
  };
}

/**
 * Identity helper for authoring a plugin — returns a {@link ChainablePlugin}
 * so the result carries the fluent `exclude` / `addRule` / `removeIntegrity` /
 * `updateFirst` / `updateMany` post-processing methods.
 */
export function definePlugin(plugin: OpysPlugin): ChainablePlugin {
  return chainable(plugin, []);
}
