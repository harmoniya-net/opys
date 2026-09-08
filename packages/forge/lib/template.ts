import {
  fetchClient,
  clientToTemplate,
  buildClasspath,
  buildLaunch,
  mapLibraries,
} from '@opys/minecraft-vanilla';
import {
  type Artifact,
  type ValDefs,
  type Launch,
  sourceUrl,
  fetchWithRetry,
} from '@opys/core';
import type { Val, Valset } from '@opys/core';
import { mergeArgs, parseLibraries } from '@opys/mojang';
import {
  parseForgeRecipe,
  type ForgeRecipe,
  type LegacyLibrary,
} from './recipe';
import { resolveForgeVersion, type ForgeIndexEntry } from './resolver';
import {
  FORGE_WRAPPER_MAIN,
  stripModuleArgs,
  resolveForgeWrapperArtifact,
  buildForgeWrapperJvmArgs,
  type ForgeWrapperOptions,
} from '@opys/forgewrapper';

export type { ForgeWrapperOptions };

const DEFAULT_SOURCE = 'https://fuckforge.harmoniya.net';

export interface ForgeOptions {
  /**
   * Forge version. Accepts:
   *   - Bare MC version: `1.20.1` (resolves to the `best` Forge build)
   *   - Alias: `1.20.1-latest` | `1.20.1-recommended` | `1.20.1-best`
   *   - Full Forge build ID: `1.20.1-47.4.20`
   */
  version: string;
  /** fuckforge index base URL. Default: `https://fuckforge.harmoniya.net`. */
  source?: string;
  /** Override the bundled ForgeWrapper JAR (processor era only). */
  forgeWrapper?: ForgeWrapperOptions;
  /**
   * URL of the Mojang version manifest, when it is not Mojang's own — a
   * mirror, or a stand-in server under test. Passed straight to
   * `fetchClient`.
   */
  manifestBase?: string;
}

export interface ForgeTemplate {
  /** Vanilla MC + Forge runtime libraries, plus installer + ForgeWrapper for the processor era. */
  artifacts: Artifact[];
  vars: ValDefs;
  /** Assembled Launch — drop straight into `manifest.launch`. */
  launch: Launch;
  /** JVM args alone, for composition (e.g. interleaving authliberty's `-javaagent`). */
  jvmArgs: Valset;
  /** Main class wrapped as a `Val` so it spreads into a `Valset`. Raw string at `mainClass.value[0]`. */
  mainClass: Val;
  /** Game args alone, for composition. */
  gameArgs: Valset;
}

export async function resolveForge(
  options: ForgeOptions,
): Promise<ForgeTemplate> {
  const source = options.source ?? DEFAULT_SOURCE;
  const indexEntry = await resolveForgeVersion(options.version, source);

  if (!indexEntry.recipe) {
    throw new Error(
      `No recipe URL listed for Forge build '${indexEntry.forge}'`,
    );
  }

  const recipeRes = await fetchWithRetry(indexEntry.recipe);
  if (!recipeRes.ok) {
    throw new Error(
      `Failed to fetch Forge recipe from ${indexEntry.recipe}: ${recipeRes.statusText}`,
    );
  }
  const recipe = parseForgeRecipe(await recipeRes.json());

  if (recipe.kind === 'unsupported') {
    throw new Error(
      `Forge era '${recipe.type}' (Minecraft <1.7) is not yet supported by @opys/minecraft. ` +
        `Only 'legacy' (1.7–1.12) and 'processor' (1.13+) builds are supported.`,
    );
  }

  if (recipe.kind === 'legacy') {
    return buildLegacyTemplate(recipe, indexEntry, options);
  }
  return buildProcessorTemplate(recipe, indexEntry, options);
}

function legacyLibraryToArtifact(lib: LegacyLibrary): Artifact {
  // No integrity when the recipe has no sha1 — only the 1.6.x builds, whose
  // artifacts are gone from every maven, reach here without one.
  return {
    path: `\${library_directory}/${lib.path}`,
    source: sourceUrl(lib.url),
    rules: [],
    ...(lib.sha1 ? { integrity: { sha1: lib.sha1 } } : {}),
    ...(lib.size != null ? { size: lib.size } : {}),
  };
}

async function buildLegacyTemplate(
  recipe: Extract<ForgeRecipe, { kind: 'legacy' }>,
  indexEntry: ForgeIndexEntry,
  options: ForgeOptions,
): Promise<ForgeTemplate> {
  // The universal jar arrives as one of `recipe.libraries`, carrying its own
  // maven URL and sha1 — `indexEntry.files.universal` is not consulted.
  const { client } = await fetchClient(indexEntry.id, {
    manifestBase: options.manifestBase,
  });
  const mc = await clientToTemplate(client);

  const forgeLibArtifacts = recipe.libraries.map(legacyLibraryToArtifact);

  // Classpath: vanilla client.jar + Forge runtime libs + vanilla MC libs
  // (log4j, lwjgl, etc. — recipe.libraries doesn't repeat them since
  // legacy version.json inherits from vanilla). Forge entries go first so
  // any version conflict resolves in Forge's favor, matching what the
  // Forge installer's generated version.json does. Legacy era doesn't use
  // the JVM module system, so no -p filtering.
  const forgeCp = recipe.libraries.map((l) => ({
    rules: l.rules,
    artifactPath: `\${library_directory}/${l.path}`,
  }));
  const vanillaCp = client.libraries.map((l) => ({
    rules: l.rules,
    artifactPath: `\${library_directory}/${l.artifact.path}`,
  }));
  const classpathEntries = buildClasspath(
    [...forgeCp, ...vanillaCp],
    '${version_dir}/client.jar',
  );

  const vars: ValDefs = { ...mc.vars, classpath: classpathEntries };

  // Legacy `minecraftArguments` REPLACE vanilla's args entirely (per fuckforge
  // recipe semantics) — don't merge with `client.args`.
  const parts = buildLaunch(
    recipe.mainClass,
    recipe.args.game,
    recipe.args.jvm,
  );

  return {
    artifacts: [...mc.artifacts, ...forgeLibArtifacts],
    vars,
    ...parts,
  };
}

async function buildProcessorTemplate(
  recipe: Extract<ForgeRecipe, { kind: 'processor' }>,
  indexEntry: ForgeIndexEntry,
  options: ForgeOptions,
): Promise<ForgeTemplate> {
  const installerFile = indexEntry.files.installer;
  if (!installerFile) {
    throw new Error(
      `No installer file listed for Forge build '${indexEntry.forge}'`,
    );
  }
  if (!indexEntry.installProfile) {
    throw new Error(
      `No install_profile URL listed for Forge build '${indexEntry.forge}'`,
    );
  }

  // The recipe's `libraries[]` is the runtime classpath subset. The full set
  // of files Forge needs on disk lives in the installer's install_profile.json
  // (which fuckforge serves as a separate URL). It includes the fml*/forge:
  // universal libs that aren't on the launch classpath but are loaded by
  // BootstrapLauncher's JarJar/module-discovery via -DlibraryDirectory.
  const installProfileRes = await fetchWithRetry(indexEntry.installProfile);
  if (!installProfileRes.ok) {
    throw new Error(
      `Failed to fetch install_profile from ${indexEntry.installProfile}: ${installProfileRes.statusText}`,
    );
  }
  const installProfile = (await installProfileRes.json()) as {
    libraries?: unknown[];
  };
  // An install-profile library with no URL is not a download: the processors
  // produce it, and ForgeWrapper runs them. Forge ships these as `"url": ""`
  // — 1.13.2 through 1.16.5 each list their own universal jar that way — and
  // without this filter they became artifacts with an empty source URL.
  const installProfileLibs = parseLibraries(
    installProfile.libraries ?? [],
  ).filter((l) => l.artifact.url !== '');

  const { client } = await fetchClient(indexEntry.id, {
    manifestBase: options.manifestBase,
  });
  const mc = await clientToTemplate(client);

  // Forge's args APPEND to vanilla's args.
  const merged = mergeArgs(client.args, recipe.args);

  const installerPath = `\${library_directory}/net/minecraftforge/forge/${indexEntry.forge}/forge-${indexEntry.forge}-installer.jar`;
  const installerArtifact: Artifact = {
    path: installerPath,
    source: sourceUrl(installerFile.url),
    rules: [],
    integrity: { md5: installerFile.md5 },
  };

  const { artifact: forgeWrapperArtifact, path: forgeWrapperPath } =
    resolveForgeWrapperArtifact(options.forgeWrapper ?? {});

  // Download set: union of recipe runtime libs + install_profile libs.
  // deduplicateArtifacts (in core) collapses duplicates by path.
  const forgeLibArtifacts = [
    ...mapLibraries(recipe.libraries),
    ...mapLibraries(installProfileLibs),
  ];

  // Classpath: vanilla libs + recipe runtime libs + ForgeWrapper.
  // ForgeWrapper (PrismLauncher fork) handles module-path setup at runtime, so
  // all jars go on -cp; no -p filtering needed here.
  const cpLibs = [...client.libraries, ...recipe.libraries];
  const libPaths = cpLibs.map((l) => ({
    rules: l.rules,
    artifactPath: `\${library_directory}/${l.artifact.path}`,
  }));
  libPaths.push({ rules: [], artifactPath: forgeWrapperPath });

  const classpathEntries = buildClasspath(
    libPaths,
    '${version_dir}/client.jar',
  );

  const vars: ValDefs = { ...mc.vars, classpath: classpathEntries };

  const finalJvm = [
    ...buildForgeWrapperJvmArgs(installerPath),
    ...stripModuleArgs(merged.jvm),
  ];

  const parts = buildLaunch(FORGE_WRAPPER_MAIN, merged.game, finalJvm);

  return {
    artifacts: [
      ...mc.artifacts,
      ...forgeLibArtifacts,
      installerArtifact,
      forgeWrapperArtifact,
    ],
    vars,
    ...parts,
  };
}
