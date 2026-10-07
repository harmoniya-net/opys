/**
 * The architecture of opys, as data.
 *
 * `CLAUDE.md` says what the boundaries are and why; this file is the same
 * statement in a form `check-architecture.mjs` can hold the tree to. The two
 * are meant to be read together, and an edit here is an architectural
 * decision: adding an edge, a binding or an exemption shows up in review as a
 * change to this file rather than as one more line in a `Cargo.toml`.
 *
 * Everything is an allow-list. A crate or package that is not named here
 * fails the check, so nothing joins the workspace without a place in it.
 */

/**
 * Every workspace crate that is not a binding: which workspace crates it may
 * depend on, and whether it has an `opys-<x>-napi` beside it.
 *
 * A binding is not listed. Its rules follow from the crate it exposes — it
 * must depend on that crate, and may otherwise reach only what that crate
 * already does.
 */
export const crates = {
  'opys-mojang-rules': { deps: [], binding: false },
  'opys-mojang': { deps: ['opys-mojang-rules'], binding: true },
  'opys-core': { deps: ['opys-mojang-rules'], binding: true },
  'opys-runtime': { deps: ['opys-core', 'opys-mojang-rules'], binding: true },
  'opys-dev': { deps: ['opys-core'], binding: true },

  // What the two pack formats share. No binding: nothing in it is called
  // from JS, only from the two crates below.
  'opys-modpack': { deps: ['opys-core'], binding: false },

  'opys-minecraft-vanilla': {
    deps: ['opys-core', 'opys-dev', 'opys-mojang', 'opys-mojang-rules'],
    binding: true,
  },
  ...Object.fromEntries(
    ['forge', 'neoforge', 'fabric', 'cleanroom', 'lwjgl3ify'].map((loader) => [
      `opys-${loader}`,
      {
        deps: [
          'opys-core',
          'opys-dev',
          'opys-mojang',
          'opys-minecraft-vanilla',
        ],
        binding: true,
      },
    ]),
  ),

  // Signs a token from its options and nothing else: no manifest, no network.
  'opys-bifrost': { deps: [], binding: true },
  'opys-minecraft-serverlist': {
    deps: ['opys-core', 'opys-dev'],
    binding: true,
  },
  'opys-java': { deps: ['opys-core', 'opys-dev'], binding: true },
  'opys-authliberty': { deps: ['opys-core', 'opys-dev'], binding: true },
  'opys-dgpuj': { deps: ['opys-core', 'opys-dev'], binding: true },
  'opys-modrinth': {
    deps: ['opys-core', 'opys-dev', 'opys-modpack'],
    binding: true,
  },
  'opys-curseforge': {
    deps: ['opys-core', 'opys-dev', 'opys-modpack'],
    binding: true,
  },
  // Dispatches to the providers; holds no client of its own.
  'opys-link': {
    deps: ['opys-core', 'opys-dev', 'opys-modrinth', 'opys-curseforge'],
    binding: true,
  },
};

const LOADERS = [
  '@opys/minecraft-vanilla',
  '@opys/forge',
  '@opys/neoforge',
  '@opys/fabric',
];

/**
 * Every package under `packages/`: which `@opys/*` packages it may depend on,
 * and whether it wraps an `@opys/<name>-binding`. A package's own binding is
 * implied by `binding: true` and is the only binding it may import.
 *
 * `external`, where present, is the complete list of third-party runtime
 * dependencies the package may declare. Left out, any declared dependency is
 * allowed — the check that an import is declared at all applies either way.
 */
export const packages = {
  // No dependencies of any kind, so either side of the wall can name the rule
  // contract without pulling anything in.
  '@opys/mojang-rules': { deps: [], binding: false, external: [] },
  '@opys/mojang': { deps: ['@opys/mojang-rules'], binding: true },
  '@opys/core': { deps: ['@opys/mojang-rules'], binding: true },
  // A clean reimplementation target: core, its own addon, and `node:`.
  '@opys/runtime': { deps: ['@opys/core'], binding: true, external: [] },
  '@opys/dev': { deps: ['@opys/core'], binding: true },

  '@opys/minecraft-vanilla': {
    deps: ['@opys/core', '@opys/dev', '@opys/mojang'],
    binding: true,
  },
  ...Object.fromEntries(
    ['forge', 'neoforge', 'fabric', 'cleanroom', 'lwjgl3ify'].map((loader) => [
      `@opys/${loader}`,
      {
        deps: ['@opys/core', '@opys/dev', '@opys/minecraft-vanilla'],
        binding: true,
      },
    ]),
  ),

  '@opys/java': { deps: ['@opys/core', '@opys/dev'], binding: true },
  '@opys/authliberty': { deps: ['@opys/core', '@opys/dev'], binding: true },
  '@opys/dgpuj': { deps: ['@opys/core', '@opys/dev'], binding: true },
  '@opys/link': { deps: ['@opys/core', '@opys/dev'], binding: true },
  // A modpack names its loader, and standing one up is running that loader's
  // plugin — composition that stays in JS, hence the loader packages here and
  // not in the crates.
  '@opys/modrinth': {
    deps: ['@opys/core', '@opys/dev', ...LOADERS],
    binding: true,
  },
  '@opys/curseforge': {
    deps: ['@opys/core', '@opys/dev', ...LOADERS],
    binding: true,
  },

  '@opys/bifrost': { deps: [], binding: true },
  '@opys/minecraft-serverlist': {
    deps: ['@opys/core', '@opys/dev'],
    binding: true,
  },

  // The umbrella: re-exports the plugins and adds nothing of its own.
  '@opys/minecraft': {
    deps: [
      '@opys/core',
      '@opys/dev',
      '@opys/mojang',
      '@opys/minecraft-vanilla',
      '@opys/forge',
      '@opys/neoforge',
      '@opys/fabric',
      '@opys/cleanroom',
      '@opys/lwjgl3ify',
      '@opys/java',
      '@opys/authliberty',
      '@opys/dgpuj',
      '@opys/link',
      '@opys/modrinth',
      '@opys/curseforge',
      '@opys/bifrost',
      '@opys/minecraft-serverlist',
    ],
    binding: false,
  },
  '@opys/cli': {
    deps: ['@opys/core', '@opys/dev', '@opys/runtime', '@opys/minecraft'],
    binding: false,
  },
};

/**
 * Boundaries stated on their own, over everything a node reaches rather than
 * only what it names. The allow-lists above already imply each of these; they
 * are repeated here so that loosening one of those lists cannot quietly take
 * a wall down with it — the lists themselves are checked against the walls.
 *
 * A wall is checked over one graph spanning both languages: a wrapper package
 * reaches the crate behind its binding, so `@opys/forge` reaching
 * `opys-runtime` through napi would break a wall exactly as a JS import would.
 *
 * `only`: the complete set `from` may reach. `never`: what it must not.
 */
export const walls = [
  {
    name: 'runtime depends on core alone',
    from: ['opys-runtime'],
    only: ['opys-core', 'opys-mojang-rules'],
  },
  {
    name: 'runtime depends on core alone',
    from: ['@opys/runtime'],
    only: [
      '@opys/core',
      '@opys/mojang-rules',
      'opys-runtime',
      'opys-core',
      'opys-mojang-rules',
    ],
  },
  {
    name: 'dev and runtime never see each other',
    from: ['opys-dev'],
    never: ['opys-runtime'],
  },
  {
    name: 'dev and runtime never see each other',
    from: ['@opys/dev'],
    never: ['@opys/runtime'],
  },
  {
    name: 'core is the intersection of build time and runtime, not the union',
    from: ['opys-core', '@opys/core'],
    never: ['opys-dev', 'opys-runtime', '@opys/dev', '@opys/runtime'],
  },
  {
    name: 'the Mojang protocol layer knows nothing of opys',
    from: ['opys-mojang', '@opys/mojang'],
    only: ['opys-mojang', 'opys-mojang-rules', '@opys/mojang-rules'],
  },
  {
    name: 'only the cli joins build time to runtime',
    from: Object.keys(packages).filter((name) => name !== '@opys/cli'),
    never: ['@opys/cli'],
  },
  {
    name: 'a plugin never installs or launches',
    from: [
      ...Object.keys(crates).filter((name) => name !== 'opys-runtime'),
      ...Object.keys(packages).filter(
        (name) => !['@opys/runtime', '@opys/cli'].includes(name),
      ),
    ],
    never: ['opys-runtime', '@opys/runtime'],
  },
  ...['forge', 'neoforge', 'fabric', 'cleanroom', 'lwjgl3ify'].flatMap(
    (loader, _, all) => [
      {
        name: 'a loader is built on vanilla, never on another loader',
        from: [`opys-${loader}`, `@opys/${loader}`],
        never: all
          .filter((other) => other !== loader)
          .flatMap((other) => [`opys-${other}`, `@opys/${other}`]),
      },
    ],
  ),
];

/**
 * Principle 1: a `class` in a package's `lib/` is a smell. An `Error`
 * subclass is how JS spells a failure variant and is always allowed; anything
 * else is listed here with the reason it stays.
 */
export const classes = {
  'packages/cli/lib/logger.ts#Logger':
    'holds the attached ProgressWriter, so a log line can clear the bar first',
  'packages/cli/lib/progress.ts#ProgressWriter':
    'owns the lines last drawn on the terminal, which a redraw has to erase',
};

/**
 * Nothing that produces manifest artifacts iterates a `HashMap`: an artifact
 * list must not reorder between two builds. Iteration cannot be told from
 * lookup by reading text, so the rule is held one step earlier — a file that
 * names `HashMap` at all is listed here with what it is used for.
 */
export const hashMaps = {
  'crates/opys-dev/src/contribution.rs':
    'launch groups, read by name through the author accessors',
  'crates/opys-dev/src/engine.rs': 'which plugin owns a var, looked up by key',
  'crates/opys-curseforge/src/files.rs': 'file id → file, looked up per ref',
  'crates/opys-curseforge/src/modpack.rs': 'file id → file, looked up per ref',
  'crates/opys-modrinth/src/files.rs': 'version id → version, looked up per id',
  'crates/opys-link/src/resolve.rs': 'provider id → file, looked up per link',
  'crates/opys-core-napi/src/lib.rs': 'the vars object as it crosses napi',
  // The install side reads a manifest and produces none.
  'crates/opys-runtime-napi/src/lib.rs': 'vars and envs as they cross napi',
  'crates/opys-runtime/src/phases/sweep.rs':
    'sweep patterns grouped by directory; the order only decides which is walked first',
};

/**
 * The `net` feature of `opys-dev` is the blocking HTTP client. A binding that
 * only folds contributions must not link it.
 */
export const withoutDefaultFeatures = [
  { crate: 'opys-dev-napi', dependency: 'opys-dev' },
  // Generates a file; it never fetches one.
  { crate: 'opys-minecraft-serverlist', dependency: 'opys-dev' },
];
