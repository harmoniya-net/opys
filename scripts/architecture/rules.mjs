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

import {
  all,
  because,
  crate,
  dependsOn,
  each,
  exempt,
  exposedToJs,
  noThirdParty,
  pkg,
  wall,
  withoutDefaults,
  wrapsItsBinding,
} from './declare.mjs';

const FORGE_FAMILY = ['forge', 'neoforge', 'fabric', 'cleanroom', 'lwjgl3ify'];

/**
 * Every workspace crate that is not a binding. A binding is not listed: it
 * must depend on the crate it exposes, and may reach only what that crate
 * already does.
 */
export const crates = all(
  crate('opys-mojang-rules'),
  crate('opys-mojang', dependsOn('opys-mojang-rules'), exposedToJs),
  crate('opys-core', dependsOn('opys-mojang-rules'), exposedToJs),
  crate(
    'opys-bundle',
    dependsOn('opys-core'),
    exposedToJs,
    because('the manifest is the contract; a zip is one way of carrying it'),
  ),
  crate(
    'opys-runtime',
    dependsOn('opys-core', 'opys-bundle', 'opys-mojang-rules'),
    exposedToJs,
  ),
  crate(
    'opys-dev',
    dependsOn('opys-core', 'opys-bundle'),
    exposedToJs,
    because('the merge names a carried file and hands it to the bundle writer'),
  ),
  crate(
    'opys-modpack',
    dependsOn('opys-core'),
    because('only the two pack crates call it, never JS'),
  ),

  crate(
    'opys-minecraft-vanilla',
    dependsOn(
      'opys-core',
      'opys-bundle',
      'opys-dev',
      'opys-mojang',
      'opys-mojang-rules',
    ),
    exposedToJs,
  ),
  each(FORGE_FAMILY, (loader) =>
    crate(
      `opys-${loader}`,
      dependsOn(
        'opys-core',
        'opys-bundle',
        'opys-dev',
        'opys-mojang',
        'opys-minecraft-vanilla',
      ),
      exposedToJs,
    ),
  ),

  crate(
    'opys-bifrost',
    exposedToJs,
    because('signs a token from its options: no manifest, no network'),
  ),
  crate(
    'opys-minecraft-serverlist',
    dependsOn('opys-core', 'opys-bundle', 'opys-dev'),
    exposedToJs,
    because('its tests read back the bytes it carries, hence the bundle'),
  ),
  crate('opys-java', dependsOn('opys-core', 'opys-dev'), exposedToJs),
  crate('opys-authliberty', dependsOn('opys-core', 'opys-dev'), exposedToJs),
  crate('opys-dgpuj', dependsOn('opys-core', 'opys-dev'), exposedToJs),
  crate(
    'opys-modrinth',
    dependsOn('opys-core', 'opys-dev', 'opys-modpack'),
    exposedToJs,
  ),
  crate(
    'opys-curseforge',
    dependsOn('opys-core', 'opys-dev', 'opys-modpack'),
    exposedToJs,
  ),
  crate(
    'opys-links',
    dependsOn('opys-core', 'opys-dev', 'opys-modrinth', 'opys-curseforge'),
    exposedToJs,
    because('dispatches to the providers; holds no client of its own'),
  ),
);

const LOADERS = [
  '@opys/minecraft-vanilla',
  '@opys/forge',
  '@opys/neoforge',
  '@opys/fabric',
];

/**
 * Every package under `packages/`. A package's own binding is the only one
 * it may import. Where no third-party list is given, any declared dependency
 * is allowed; that an import is declared at all is checked either way.
 */
export const packages = all(
  pkg(
    '@opys/mojang-rules',
    noThirdParty,
    because('either side of the wall names the rule contract at no cost'),
  ),
  pkg('@opys/mojang', dependsOn('@opys/mojang-rules'), wrapsItsBinding),
  pkg('@opys/core', dependsOn('@opys/mojang-rules'), wrapsItsBinding),
  pkg('@opys/bundle', dependsOn('@opys/core'), wrapsItsBinding, noThirdParty),
  pkg(
    '@opys/runtime',
    dependsOn('@opys/core', '@opys/bundle'),
    wrapsItsBinding,
    noThirdParty,
    because(
      'a clean reimplementation target; the bundle is for the type of a head, which `readHead` returns',
    ),
  ),
  pkg('@opys/dev', dependsOn('@opys/core', '@opys/bundle'), wrapsItsBinding),

  pkg(
    '@opys/minecraft-vanilla',
    dependsOn('@opys/core', '@opys/dev', '@opys/mojang'),
    wrapsItsBinding,
  ),
  each(FORGE_FAMILY, (loader) =>
    pkg(
      `@opys/${loader}`,
      dependsOn('@opys/core', '@opys/dev', '@opys/minecraft-vanilla'),
      wrapsItsBinding,
    ),
  ),

  pkg('@opys/java', dependsOn('@opys/core', '@opys/dev'), wrapsItsBinding),
  pkg(
    '@opys/authliberty',
    dependsOn('@opys/core', '@opys/dev'),
    wrapsItsBinding,
  ),
  pkg('@opys/dgpuj', dependsOn('@opys/core', '@opys/dev'), wrapsItsBinding),
  pkg('@opys/links', dependsOn('@opys/core', '@opys/dev'), wrapsItsBinding),
  pkg(
    '@opys/modrinth',
    dependsOn('@opys/core', '@opys/dev', ...LOADERS),
    wrapsItsBinding,
    because('a modpack names its loader, and running that plugin is JS'),
  ),
  pkg(
    '@opys/curseforge',
    dependsOn('@opys/core', '@opys/dev', ...LOADERS),
    wrapsItsBinding,
    because('a modpack names its loader, and running that plugin is JS'),
  ),

  pkg('@opys/bifrost', wrapsItsBinding),
  pkg(
    '@opys/minecraft-serverlist',
    dependsOn('@opys/core', '@opys/dev'),
    wrapsItsBinding,
  ),

  pkg(
    '@opys/minecraft',
    dependsOn(
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
      '@opys/links',
      '@opys/modrinth',
      '@opys/curseforge',
      '@opys/bifrost',
      '@opys/minecraft-serverlist',
    ),
    because('the umbrella: re-exports the plugins and adds nothing'),
  ),
  pkg(
    '@opys/cli',
    dependsOn(
      '@opys/core',
      '@opys/bundle',
      '@opys/dev',
      '@opys/runtime',
      '@opys/minecraft',
    ),
  ),
);

const everyCrate = Object.keys(crates);
const everyPackage = Object.keys(packages);
const except = (names, ...left) => names.filter((n) => !left.includes(n));

/**
 * Boundaries stated on their own. The allow-lists above already imply each;
 * they are repeated so that loosening a list cannot take a wall down
 * unnoticed. One graph spans both languages: a wrapper package reaches the
 * crate behind its binding.
 */
export const walls = [
  wall('runtime depends on core and the bundle alone')
    .from('opys-runtime')
    .reachesOnly('opys-core', 'opys-bundle', 'opys-mojang-rules'),
  wall('runtime depends on core and the bundle alone')
    .from('@opys/runtime')
    .reachesOnly(
      '@opys/core',
      '@opys/bundle',
      '@opys/mojang-rules',
      'opys-runtime',
      'opys-core',
      'opys-bundle',
      'opys-mojang-rules',
    ),
  wall('the bundle carries a manifest and knows nothing else')
    .from('opys-bundle', '@opys/bundle')
    .reachesOnly(
      '@opys/core',
      '@opys/mojang-rules',
      'opys-bundle',
      'opys-core',
      'opys-mojang-rules',
    ),
  wall('dev and runtime never see each other')
    .from('opys-dev')
    .neverReaches('opys-runtime'),
  wall('dev and runtime never see each other')
    .from('@opys/dev')
    .neverReaches('@opys/runtime'),
  wall('core is the intersection of build time and runtime, not the union')
    .from('opys-core', '@opys/core')
    .neverReaches(
      'opys-dev',
      'opys-runtime',
      'opys-bundle',
      '@opys/dev',
      '@opys/runtime',
      '@opys/bundle',
    ),
  wall('the Mojang protocol layer knows nothing of opys')
    .from('opys-mojang', '@opys/mojang')
    .reachesOnly('opys-mojang', 'opys-mojang-rules', '@opys/mojang-rules'),
  wall('only the cli joins build time to runtime')
    .from(except(everyPackage, '@opys/cli'))
    .neverReaches('@opys/cli'),
  wall('a plugin never installs or launches')
    .from(
      except(everyCrate, 'opys-runtime'),
      except(everyPackage, '@opys/runtime', '@opys/cli'),
    )
    .neverReaches('opys-runtime', '@opys/runtime'),
  ...each(FORGE_FAMILY, (loader) =>
    wall('a loader is built on vanilla, never on another loader')
      .from(`opys-${loader}`, `@opys/${loader}`)
      .neverReaches(
        except(FORGE_FAMILY, loader).flatMap((other) => [
          `opys-${other}`,
          `@opys/${other}`,
        ]),
      ),
  ),
];

/**
 * A `class` in a package's `lib/` is a smell. An `Error` subclass is always
 * allowed; anything else is here with the reason it stays.
 */
export const classes = all(
  exempt(
    'packages/cli/lib/logger.ts#Logger',
    'holds the attached ProgressWriter, so a log line can clear the bar first',
  ),
  exempt(
    'packages/cli/lib/progress.ts#ProgressWriter',
    'owns the lines last drawn on the terminal, which a redraw has to erase',
  ),
);

/**
 * Nothing that produces manifest artifacts iterates a `HashMap`. Iteration
 * cannot be told from lookup by reading text, so a file that names `HashMap`
 * at all is here with what it is used for.
 */
export const hashMaps = all(
  exempt(
    'crates/opys-dev/src/contribution.rs',
    'launch groups, read by name through the author accessors',
  ),
  exempt(
    'crates/opys-dev/src/engine.rs',
    'which plugin owns a var, looked up by key',
  ),
  exempt(
    'crates/opys-curseforge/src/files.rs',
    'file id → file, looked up per ref',
  ),
  exempt(
    'crates/opys-curseforge/src/modpack.rs',
    'file id → file, looked up per ref',
  ),
  exempt(
    'crates/opys-modrinth/src/files.rs',
    'version id → version, looked up per id',
  ),
  exempt(
    'crates/opys-links/src/resolve.rs',
    'provider id → file, looked up per link',
  ),
  exempt('crates/opys-napi/src/core.rs', 'the vars object as it crosses napi'),
  exempt(
    'crates/opys-napi/src/runtime.rs',
    'vars and envs as they cross napi; the install side produces no manifest',
  ),
);

/**
 * The `net` feature of `opys-dev` is the blocking HTTP client, and these
 * must not ask for it.
 */
export const withoutDefaultFeatures = [
  withoutDefaults(
    'opys-minecraft-serverlist',
    'opys-dev',
    because('it generates a file and never fetches one'),
  ),
];
