import type {
  Artifact,
  CleanupRule,
  ValDefs,
  Manifest,
  Val,
  Valset,
} from '@opys/core';
import type { OptionsInput } from '@opys/bundle';
import type { OpysPlugin } from './plugin';

/** One entry of a config's `args` — flattened, in order, to a `Valset`. */
export type ArgItem = Valset | Val | string;

/** Any plugin, whatever it is called and whatever it exposes. */
export type AnyPlugin = OpysPlugin<string, string>;

/**
 * Every reference a list of plugins allows: `'@forge.jvmArgs' | '@java.bin'`.
 * A plugin whose type does not say what it is called or what it exposes — one
 * written without `definePlugin`, or held in a variable typed `OpysPlugin` —
 * allows any reference, and is checked when the config is built instead.
 */
export type Refs<P extends readonly AnyPlugin[]> = P[number] extends infer X
  ? X extends OpysPlugin<infer N, infer G>
    ? `@${N}.${G}`
    : never
  : never;

/**
 * A string of the launch line as the compiler sees it: one that begins with
 * `@` has to be a reference the plugins allow, and any other is itself.
 */
type Checked<P extends readonly AnyPlugin[], T> = T extends `@${string}`
  ? Refs<P>
  : T;

/**
 * The manifest block of a config. Its type parameters are there for
 * `defineConfig` to infer, so that a reference is checked against the plugins
 * beside it; written out bare, `OpysManifestConfig` takes any string.
 */
export interface OpysManifestConfig<
  P extends readonly AnyPlugin[] = readonly AnyPlugin[],
  C extends string = string,
  A extends readonly ArgItem[] = readonly ArgItem[],
  W extends string = string,
> {
  /** Hand-written literal artifacts, merged with plugin output (last wins). */
  artifacts?: Artifact[];
  /** Override/extra vars layered on top of the merged plugin vars. */
  vars?: ValDefs;
  /**
   * What to run: a literal, or a reference to a launch group that is one
   * string — typically `'@java.bin'`.
   */
  command: Checked<P, C>;
  /**
   * The arguments, in order. A string that begins with `@` is replaced by
   * the launch group it names — `'@forge.jvmArgs'` — and anything else is
   * passed as it is. For an argument that really begins with `@`, as an
   * argument file does for `java`, write `'\\@file'`.
   */
  args: { readonly [I in keyof A]: Checked<P, A[I]> };
  /** Working directory for the launched process; a literal or a reference. */
  workdir?: Checked<P, W>;
  /** Environment variables for the launched process. */
  envs?: ValDefs;
  /**
   * Files to remove after install: what `includes` matches, less `excludes`.
   * A file the manifest installs is never removed.
   */
  cleanup?: CleanupRule[];
}

export interface OpysConfig<
  P extends readonly AnyPlugin[] = readonly AnyPlugin[],
  C extends string = string,
  A extends readonly ArgItem[] = readonly ArgItem[],
  W extends string = string,
> {
  /**
   * Where `opys build` writes the bundle, relative to the config file —
   * conventionally `<name>.opys`.
   */
  output?: string;
  /**
   * The plugins whose `build` hooks produce the manifest. Each has a name of
   * its own, since that is what a reference goes by.
   */
  plugins: P;
  /** Declarative manifest fields, separate from tooling config. */
  manifest: OpysManifestConfig<P, C, A, W>;
  /**
   * What whoever launches the pack may choose: `options().slider(…)…`, or a
   * list of `slider(…)`, `feature(…)` and the rest. Each fills a variable or
   * switches a feature the manifest already reads; this says which of them
   * are a player's, and how to ask. It goes into the bundle's head, not the
   * manifest.
   */
  options?: OptionsInput;
  /**
   * Launch-time manifest patch. Re-run on every `opys launch`; the returned
   * partial is shallow-merged (per field) over the loaded manifest.
   */
  run?: (manifest: Manifest) => Partial<Manifest>;
}

export interface OpysConfigContext {
  /** Value of `--mode <m>`; the cli passes the command's name when unset. */
  mode: string;
}

export type OpysConfigInput =
  OpysConfig | ((ctx: OpysConfigContext) => OpysConfig | Promise<OpysConfig>);

/**
 * Use as the default export of `opys.config.mjs`.
 *
 * It returns what it is given. What it adds is the check: the plugins and
 * the launch line are inferred together, so `'@forge.jvmArg'` is an error
 * where it is written, with the references that do exist offered in its
 * place.
 */
export function defineConfig<
  const P extends readonly AnyPlugin[],
  const C extends string,
  const A extends readonly ArgItem[],
  const W extends string,
>(
  input:
    | OpysConfig<P, C, A, W>
    | ((
        ctx: OpysConfigContext,
      ) => OpysConfig<P, C, A, W> | Promise<OpysConfig<P, C, A, W>>),
): OpysConfigInput {
  return input as OpysConfigInput;
}

/** Resolve a config input to a concrete `OpysConfig`. */
export async function resolveConfig(
  input: OpysConfigInput,
  ctx: OpysConfigContext,
): Promise<OpysConfig> {
  return typeof input === 'function' ? input(ctx) : input;
}
