import type { Artifact, Source, ValDefs, Val, Valset } from '@opys/core';
import { parseShortRuleset } from '@opys/core';
import { matchesSelector, type RulesetInput, type Selector } from './selector';

/** Build-time context handed to every plugin's `build` hook. */
export interface BuildContext {
  /** Sanctioned build-time logging channel; auto-prefixed by plugin name. */
  log: (scope: string, message: string) => void;
  /** Absolute directory of `opys.config.mjs` — anchor for relative paths. */
  configDir: string;
  /** Value of `--mode <m>`; the cli passes the command's name when unset. */
  mode: string;
}

/**
 * Named launch fragments a plugin exposes for the config's `command`/`args`
 * accessor functions — e.g. `{ jvmArgs, mainClass, gameArgs }` or `{ bin }`.
 */
export type LaunchGroups<G extends string = string> = Record<
  G,
  Valset | Val | string
>;

/**
 * Where a build-time artifact's bytes are: as a manifest says it, or on this
 * machine — a file, or bytes a plugin made. The last two never reach a
 * manifest: the build reads them, names them by their content and carries
 * them in the bundle as blobs.
 */
export type BuildSource =
  Source | { readonly file: string } | { readonly bytes: Uint8Array };

/** An artifact as a plugin hands it over: a manifest's, with a `BuildSource`. */
export type BuildArtifact = Omit<Artifact, 'source'> & {
  readonly source: BuildSource;
};

/**
 * What a plugin's `build` hook returns. `G` is the names of the launch
 * groups in it — inferred from what `build` returns, so a plugin's type says
 * what a config may reference without anybody writing the list twice.
 */
export interface Contribution<G extends string = string> {
  /**
   * Artifacts to download/copy/extract. One whose bytes are on this machine
   * says so in its own `source` — `{ file }`, or `{ bytes }` the plugin
   * made — and the build carries it in the bundle.
   */
  artifacts?: BuildArtifact[];
  /** Manifest vars this plugin owns. */
  vars?: ValDefs;
  /**
   * Named launch fragments. A config puts them on the launch line by name:
   * `args: ['@forge.jvmArgs']`.
   */
  launch?: LaunchGroups<G>;
  /**
   * Launch environment variables this plugin sets by default (e.g. `@opys/java`
   * exports `JAVA_HOME`). Merged across plugins in list order — last wins, with
   * a collision warning — and the config's `manifest.envs` is the final
   * override layer.
   */
  envs?: ValDefs;
}

/**
 * A opys plugin — a pure-to-construct, bundler-style hook object. The
 * constructor (`forge('1.20.1-best')`, …) does zero I/O; all network/fs work
 * happens inside `build`, which the engine drives.
 */
export interface OpysPlugin<
  N extends string = string,
  G extends string = string,
> {
  /**
   * What a config calls this plugin in a reference — `@<name>.<group>` — so
   * no two plugins of a config may share one. Rename with `.as('…')`.
   */
  name: N;
  build(ctx: BuildContext): Promise<Contribution<G>> | Contribution<G>;
}

/**
 * The patch passed to `updateFirst` / `updateMany` — either a literal partial
 * artifact, or a function of the matched artifact (to derive a field from the
 * current value, e.g. a mirror URL off the existing path).
 */
export type ArtifactPatch =
  | Partial<BuildArtifact>
  | ((artifact: BuildArtifact) => Partial<BuildArtifact>);

/**
 * A plugin you can post-process fluently. Every method returns a **new** plugin
 * with one more artifact transform appended — pure, so the original is
 * untouched and chains read left-to-right. Transforms rewrite `artifacts` only;
 * `vars` / `launch` pass through. The engine sees only `name` / `build`.
 */
export interface ChainablePlugin<
  N extends string = string,
  G extends string = string,
> extends OpysPlugin<N, G> {
  /**
   * The same plugin under another name — what a config needs when it uses
   * one kind twice, since a reference goes by name.
   */
  as<const M extends string>(name: M): ChainablePlugin<M, G>;
  /** Drop every artifact matching `match`. */
  exclude(match: Selector): ChainablePlugin<N, G>;
  /**
   * Append a ruleset (shorthand `'allow.os.osx'` or a full `Ruleset`) to each
   * matched artifact's existing `rules`.
   */
  addRule(match: Selector, rules: RulesetInput): ChainablePlugin<N, G>;
  /** Clear `integrity` on matched artifacts, so they install unverified. */
  removeIntegrity(match: Selector): ChainablePlugin<N, G>;
  /** Shallow-merge a patch into the first matching artifact (input order). */
  updateFirst(match: Selector, patch: ArtifactPatch): ChainablePlugin<N, G>;
  /** Shallow-merge a patch into every matching artifact. */
  updateMany(match: Selector, patch: ArtifactPatch): ChainablePlugin<N, G>;
}

/** A pure artifact-list rewrite accumulated by one fluent call. */
type Transform = (artifacts: BuildArtifact[]) => BuildArtifact[];

const merge = (
  artifact: BuildArtifact,
  patch: ArtifactPatch,
): BuildArtifact => ({
  ...artifact,
  ...(typeof patch === 'function' ? patch(artifact) : patch),
});

function chainable<N extends string, G extends string>(
  base: OpysPlugin<N, G>,
  transforms: readonly Transform[],
): ChainablePlugin<N, G> {
  const push = (t: Transform) => chainable(base, [...transforms, t]);
  const mapMatched =
    (match: Selector, f: (a: BuildArtifact) => BuildArtifact): Transform =>
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
    as: (name) =>
      chainable({ name, build: (ctx) => base.build(ctx) }, transforms),
    exclude: (match) =>
      push((arts) => arts.filter((a) => !matchesSelector(match, a))),
    addRule: (match, rules) =>
      push(
        mapMatched(match, (a) => ({
          ...a,
          rules: [
            ...parseShortRuleset(a.rules ?? []),
            ...parseShortRuleset(rules),
          ],
        })),
      ),
    removeIntegrity: (match) =>
      push(
        mapMatched(match, (a) => ({
          ...a,
          integrity: undefined,
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
 *
 * The plugin's name and the launch groups it returns are part of its type,
 * which is what lets `defineConfig` check `'@name.group'`. Both are inferred;
 * a plugin that returns no `launch` exposes nothing. Where `build` returns a
 * contribution of unknown shape — one handed over by a native crate — say
 * what it holds: `definePlugin<'java', 'bin'>({ … })`.
 */
export function definePlugin<const N extends string, G extends string = never>(
  plugin: OpysPlugin<N, G>,
): ChainablePlugin<N, G> {
  return chainable(plugin, []);
}

/**
 * The options a plugin was called with, once they are known to be an object.
 *
 * Every plugin takes one options object. A config is plain JavaScript as
 * often as not, where nothing has checked the call, and `forge('1.20.1')` —
 * how it was once written — would otherwise be spread into nothing and fail
 * somewhere deep in the build. So it is refused here, with the spelling that
 * works.
 */
export function pluginOptions<T extends object>(
  example: string,
  options: T,
): T {
  if (options === null || typeof options !== 'object' || Array.isArray(options))
    throw new TypeError(
      `a plugin takes one options object — ${example} — and was given ${JSON.stringify(options)}`,
    );
  return options;
}
