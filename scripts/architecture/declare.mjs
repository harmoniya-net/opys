/**
 * The words `rules.mjs` is written in. Each one builds plain data, which is
 * all the checks ever read, so a rule says what it means and carries its
 * reason as a value rather than as a comment beside it.
 */

const declared =
  (defaults) =>
  (name, ...traits) => [name, Object.assign({ ...defaults }, ...traits)];

/** A workspace crate that is not a binding. */
export const crate = declared({ deps: [], binding: false });
/** A package under `packages/`. */
export const pkg = declared({ deps: [], binding: false });

/** The workspace crates, or `@opys/*` packages, it may depend on. */
export const dependsOn = (...deps) => ({ deps });
/** A crate with a module in the addon, and so a namespace in JS. */
export const exposedToJs = { binding: true };
/** A package that wraps its own namespace of `@opys/binding`, and no other. */
export const wrapsItsBinding = { binding: true };
/** The complete list of third-party runtime dependencies it may declare. */
export const thirdParty = (...external) => ({ external });
export const noThirdParty = thirdParty();
/** Why a rule is the way it is. Kept as data; no check reads it. */
export const because = (why) => ({ why });

/** One rule for each of `names`. */
export const each = (names, rule) => names.map(rule);

/** Declarations, and groups of them from `each`, as the lookup the checks take. */
export const all = (...declarations) =>
  Object.fromEntries(
    declarations.flatMap((declaration) =>
      Array.isArray(declaration[0]) ? declaration : [declaration],
    ),
  );

/**
 * A boundary over everything `from` reaches, not only what it names:
 * `reachesOnly` is the complete set, `neverReaches` what it must not.
 */
export const wall = (name) => ({
  from: (...from) => ({
    reachesOnly: (...only) => ({ name, from: from.flat(), only }),
    neverReaches: (...never) => ({
      name,
      from: from.flat(),
      never: never.flat(),
    }),
  }),
});

/** An exemption, and the reason it stands. */
export const exempt = (subject, why) => [subject, why];

/** `crate` takes `dependency` with its default features off. */
export const withoutDefaults = (crate, dependency, ...traits) =>
  Object.assign({ crate, dependency }, ...traits);
