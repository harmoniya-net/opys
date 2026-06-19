import { z } from 'zod';
import {
  fetchClient,
  clientToTemplate,
  buildClasspath,
  buildLaunch,
} from '@opys/minecraft-vanilla';
import {
  type Artifact,
  type ValDefs,
  type Launch,
  type Val,
  type Valset,
  sourceUrl,
  fetchWithRetry,
} from '@opys/core';
import { mergeArgs, parseArguments, parseMaven } from '@opys/mojang';
import type { MavenCoord } from '@opys/mojang';
import {
  resolveFabricVersion,
  DEFAULT_FABRIC_META,
  type FabricRelease,
} from './resolver';

export interface FabricOptions {
  /** Minecraft (game) version, e.g. `1.21.4`. */
  version: string;
  /**
   * Fabric loader version, e.g. `0.16.10`. Omit for the latest stable loader
   * build that targets `version`.
   */
  loader?: string;
  /** Fabric Meta base URL. Default: `https://meta.fabricmc.net`. */
  source?: string;
}

export interface FabricTemplate {
  /** Vanilla MC artifacts + Fabric loader/intermediary library artifacts. */
  artifacts: Artifact[];
  vars: ValDefs;
  /** Assembled Launch — drop straight into `manifest.launch`. */
  launch: Launch;
  /** JVM args alone, for composition (e.g. interleaving authliberty's `-javaagent`). */
  jvmArgs: Valset;
  /** Main class wrapped as a `Val` so it spreads into a `Valset`. */
  mainClass: Val;
  /** Game args alone, for composition. */
  gameArgs: Valset;
}

/**
 * A Fabric launcher-profile library: a Maven coordinate plus the repo base it
 * lives in. Newer Meta responses also ship per-file `sha1`/`size` — used for
 * artifact integrity when present.
 */
const FabricLibrarySchema = z.object({
  name: z.string(),
  url: z.string(),
  sha1: z.string().optional(),
  size: z.number().optional(),
});

const FabricProfileSchema = z.object({
  inheritsFrom: z.string(),
  mainClass: z.string(),
  arguments: z.unknown().optional(),
  libraries: z.array(FabricLibrarySchema),
});

type FabricLibrary = z.infer<typeof FabricLibrarySchema>;

/** Maven coord with `version` required. */
type ResolvedCoord = MavenCoord & { version: string };

/**
 * Build a maven path from a coord:
 * `<group_path>/<artifact>/<version>/<artifact>-<version>[-<classifier>].<ext>`.
 */
function mavenPath(c: ResolvedCoord): string {
  const groupPath = c.groupId.replace(/\./g, '/');
  const ext = c.packaging ?? 'jar';
  const filename = c.classifier
    ? `${c.artifactId}-${c.version}-${c.classifier}.${ext}`
    : `${c.artifactId}-${c.version}.${ext}`;
  return `${groupPath}/${c.artifactId}/${c.version}/${filename}`;
}

function requireVersioned(name: string): ResolvedCoord {
  const coord = parseMaven(name);
  if (coord.version === undefined) {
    throw new Error(`Fabric library coordinate '${name}' has no version`);
  }
  return coord as ResolvedCoord;
}

/** A Fabric profile library → artifact + its `${library_directory}`-relative path. */
function fabricLibArtifact(lib: FabricLibrary): {
  artifact: Artifact;
  path: string;
} {
  const path = mavenPath(requireVersioned(lib.name));
  const url = `${lib.url.replace(/\/+$/, '')}/${path}`;
  const artifact: Artifact = {
    path: `\${library_directory}/${path}`,
    source: sourceUrl(url),
    rules: [],
    ...(lib.size ? { size: lib.size } : {}),
    ...(lib.sha1 ? { integrity: { sha1: lib.sha1 } } : {}),
  };
  return { artifact, path };
}

async function fetchProfile(
  url: string,
): Promise<z.infer<typeof FabricProfileSchema>> {
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(
      `Failed to download Fabric profile from ${url}: ${res.status} ${res.statusText}`,
    );
  }
  return FabricProfileSchema.parse(await res.json());
}

export async function resolveFabric(
  options: FabricOptions,
): Promise<FabricTemplate> {
  const meta = options.source ?? DEFAULT_FABRIC_META;
  const release: FabricRelease = await resolveFabricVersion(
    options.version,
    meta,
    options.loader,
  );

  const profile = await fetchProfile(release.profileUrl);

  const { client } = await fetchClient(profile.inheritsFrom);
  const mc = await clientToTemplate(client);

  // Fabric profile libraries are Maven coord + repo base, no OS rules and no
  // natives — every entry goes on the classpath unconditionally.
  const fabricLibs = profile.libraries.map(fabricLibArtifact);

  const libPaths = [
    ...client.libraries.map((l) => ({
      rules: l.rules,
      artifactPath: `\${library_directory}/${l.artifact.path}`,
    })),
    ...fabricLibs.map(({ path }) => ({
      rules: [],
      artifactPath: `\${library_directory}/${path}`,
    })),
  ];

  const classpath = buildClasspath(libPaths, '${version_dir}/client.jar');

  const fabricArgs = parseArguments(profile.arguments ?? { game: [], jvm: [] });
  const merged = mergeArgs(client.args, fabricArgs);

  const vars: ValDefs = { ...mc.vars, classpath };
  const parts = buildLaunch(profile.mainClass, merged.game, merged.jvm);

  return {
    artifacts: [...mc.artifacts, ...fabricLibs.map(({ artifact }) => artifact)],
    vars,
    ...parts,
  };
}
