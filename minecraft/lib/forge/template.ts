import {
  fetchClient,
  clientToTemplate,
  buildClasspath,
  buildLaunch,
  mapLibraries,
} from '../internal';
import {
  type Artifact,
  type ValDefs,
  type Launch,
  sourceUrl,
  fetchWithRetry,
} from '@torba/core';
import type { Val, Valset } from '@torba/core';
import type { MojangArgValue, Arguments, Library } from '@torba/mojang';
import { mergeArgs, parseLibraries } from '@torba/mojang';
import {
  parseForgeRecipe,
  type ForgeRecipe,
  type LegacyLibrary,
} from './recipe';
import { resolveForgeVersion, type ForgeIndexEntry } from './resolver';

const DEFAULT_SOURCE = 'https://fuckforge.harmoniya.net';

const DEFAULT_FORGE_WRAPPER = {
  version: '1.6.0',
  url: 'https://github.com/ZekerZhayard/ForgeWrapper/releases/download/1.6.0/ForgeWrapper-1.6.0.jar',
  sha1: '035a51fe6439792a61507630d89382f621da0f1f',
  size: 28679,
} as const;

const FORGE_WRAPPER_MAIN = 'io.github.zekerzhayard.forgewrapper.installer.Main';

/**
 * Forge version JSONs sometimes embed raw `../libraries/` paths (relative to a
 * `.minecraft/versions/<id>/` layout). Rewrite to the torba var equivalent.
 */
function fixPath(s: string): string {
  return s.replace(/\.\.\/libraries\//g, '${library_directory}/');
}

function fixArg(arg: MojangArgValue): MojangArgValue {
  if (typeof arg === 'string') return fixPath(arg);
  const value = Array.isArray(arg.value)
    ? arg.value.map(fixPath)
    : fixPath(arg.value);
  return { ...arg, value };
}

function normalizeForgeArgs(args: Arguments): Arguments {
  return { ...args, jvm: args.jvm.map(fixArg) };
}

/**
 * Extract artifact paths on the Java module path (-p) from parsed args.
 * These jars must NOT appear on -cp or the JVM module system breaks.
 */
function modulePathArtifacts(args: Arguments): Set<string> {
  const flat: string[] = [];
  for (const arg of args.jvm) {
    if (typeof arg === 'string') flat.push(arg);
    else flat.push(...(Array.isArray(arg.value) ? arg.value : [arg.value]));
  }
  const artifacts = new Set<string>();
  for (let i = 0; i < flat.length; i++) {
    if (flat[i] === '-p' || flat[i] === '--module-path') {
      const pathStr = flat[++i];
      if (!pathStr) continue;
      for (const jar of pathStr.split(/[:;]/)) {
        const m = jar.match(/^\$\{library_directory\}\/(.+)$/);
        if (m?.[1]) artifacts.add(m[1]);
      }
    }
  }
  return artifacts;
}

export interface ForgeWrapperOptions {
  /** Download URL for the ForgeWrapper JAR. */
  url?: string;
  /** Optional sha1 for integrity verification. */
  sha1?: string;
  /** Optional declared size in bytes. */
  size?: number;
  /** Override the destination path under `${library_directory}`. */
  path?: string;
}

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
  const recipe = parseForgeRecipe(await recipeRes.json(), {
    forgeUniversal: indexEntry.files.universal && {
      url: indexEntry.files.universal.url,
      md5: indexEntry.files.universal.md5,
    },
  });

  if (recipe.kind === 'unsupported') {
    throw new Error(
      `Forge era '${recipe.type}' (Minecraft <1.7) is not yet supported by @torba/forge. ` +
        `Only 'legacy' (1.7–1.12) and 'processor' (1.13+) builds are supported.`,
    );
  }

  if (recipe.kind === 'legacy') {
    return buildLegacyTemplate(recipe, indexEntry);
  }
  return buildProcessorTemplate(recipe, indexEntry, options);
}

function legacyLibraryToArtifact(lib: LegacyLibrary): Artifact {
  // Prefer sha1 (what 3rd-party libs in the recipe carry); fall back to md5
  // (what fuckforge ships for the Forge universal jar). Skip integrity only
  // if neither is available — which shouldn't happen with well-formed input.
  const integrity = lib.sha1
    ? { sha1: lib.sha1 }
    : lib.md5
      ? { md5: lib.md5 }
      : undefined;
  return {
    path: `\${library_directory}/${lib.path}`,
    source: sourceUrl(lib.url),
    rules: [],
    ...(integrity ? { integrity } : {}),
    ...(lib.size != null ? { size: lib.size } : {}),
  };
}

async function buildLegacyTemplate(
  recipe: Extract<ForgeRecipe, { kind: 'legacy' }>,
  indexEntry: ForgeIndexEntry,
): Promise<ForgeTemplate> {
  if (!indexEntry.files.universal) {
    throw new Error(
      `No universal JAR listed for legacy Forge build '${indexEntry.forge}'`,
    );
  }

  const { client } = await fetchClient(indexEntry.id);
  const mc = await clientToTemplate(client);

  const forgeLibArtifacts = recipe.libraries.map(legacyLibraryToArtifact);

  // Classpath: vanilla client.jar + Forge runtime libs + vanilla MC libs
  // (log4j, lwjgl, etc. — recipe.libraries doesn't repeat them since
  // legacy version.json inherits from vanilla). Forge entries go first so
  // any version conflict resolves in Forge's favor, matching what the
  // Forge installer's generated version.json does. Legacy era doesn't use
  // the JVM module system, so no -p filtering.
  const forgeCp = recipe.libraries.map((l) => ({
    rules: l.rules as unknown[],
    artifactPath: `\${library_directory}/${l.path}`,
  }));
  const vanillaCp = client.libraries.map((l) => ({
    rules: l.rules as unknown[],
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
  const installProfileLibs = parseLibraries(installProfile.libraries ?? []);

  const { client } = await fetchClient(indexEntry.id);
  const mc = await clientToTemplate(client);

  // Forge's args APPEND to vanilla's args.
  const merged = normalizeForgeArgs(mergeArgs(client.args, recipe.args));
  const onModulePath = modulePathArtifacts(merged);

  const installerPath = `\${library_directory}/net/minecraftforge/forge/${indexEntry.forge}/forge-${indexEntry.forge}-installer.jar`;
  const installerArtifact: Artifact = {
    path: installerPath,
    source: sourceUrl(installerFile.url),
    rules: [],
    integrity: { md5: installerFile.md5 },
  };

  const fwOpt = options.forgeWrapper ?? {};
  const fwUrl = fwOpt.url ?? DEFAULT_FORGE_WRAPPER.url;
  const fwSha1 =
    fwOpt.sha1 ?? (fwOpt.url ? undefined : DEFAULT_FORGE_WRAPPER.sha1);
  const fwSize =
    fwOpt.size ?? (fwOpt.url ? undefined : DEFAULT_FORGE_WRAPPER.size);
  const forgeWrapperPath =
    fwOpt.path ??
    `\${library_directory}/io/github/zekerzhayard/forgewrapper/${DEFAULT_FORGE_WRAPPER.version}/forgewrapper-${DEFAULT_FORGE_WRAPPER.version}.jar`;
  const forgeWrapperArtifact: Artifact = {
    path: forgeWrapperPath,
    source: sourceUrl(fwUrl),
    rules: [],
    ...(fwSha1 ? { integrity: { sha1: fwSha1 } } : {}),
    ...(fwSize != null ? { size: fwSize } : {}),
  };

  // Download set: union of recipe runtime libs + install_profile libs.
  // deduplicateArtifacts (in core) collapses duplicates by path.
  const forgeLibArtifacts = [
    ...mapLibraries(recipe.libraries),
    ...mapLibraries(installProfileLibs),
  ];

  // Classpath: vanilla libs + recipe runtime libs + ForgeWrapper, minus -p entries.
  // Use recipe.libraries (NOT install_profile.libraries) here — only the runtime
  // subset goes on -cp; the rest are loaded dynamically by Forge.
  const cpLibs: Library[] = [...client.libraries, ...recipe.libraries];
  const libPaths = cpLibs
    .filter((l) => !onModulePath.has(l.artifact.path))
    .map((l) => ({
      rules: l.rules as unknown[],
      artifactPath: `\${library_directory}/${l.artifact.path}`,
    }));
  libPaths.push({ rules: [], artifactPath: forgeWrapperPath });

  const classpathEntries = buildClasspath(
    libPaths,
    '${version_dir}/client.jar',
  );

  const vars: ValDefs = { ...mc.vars, classpath: classpathEntries };

  const wrapperJvmArgs: MojangArgValue[] = [
    `-Dforgewrapper.installer=${installerPath}`,
    `-Dforgewrapper.minecraft=\${version_dir}/client.jar`,
    `-Dforgewrapper.librariesDir=\${library_directory}`,
  ];
  const finalJvm = [...merged.jvm, ...wrapperJvmArgs];

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
