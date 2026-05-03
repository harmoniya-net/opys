import { readFile } from 'node:fs/promises';
import {
  fetchClient,
  clientToTemplate,
  buildClasspath,
  buildLaunch,
} from '@torba/minecraft';
import type { Artifact, ValDefs, Launch } from '@torba/core';
import type { MojangArgValue, Arguments } from '@torba/mojang';
import { mergeArgs } from '@torba/mojang';
import { parseForgeManifest } from './parser';

/**
 * Forge version JSONs embed raw relative paths like `../libraries/` (relative to the
 * versions/<id>/ directory in a standard .minecraft layout). Rewrite them to the
 * torba var equivalents so they resolve correctly regardless of working directory.
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

/** Rewrite raw `../libraries/` paths in JVM args to `${library_directory}/`. */
function normalizeForgeArgs(args: Arguments): Arguments {
  return { ...args, jvm: args.jvm.map(fixArg) };
}

/**
 * Extract artifact paths on the Java module path (-p) from parsed args.
 * Returned as the fragment after `${library_directory}/`.
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

export interface ForgeOptions {
  /** Minecraft version string, e.g. '1.20.1' */
  version: string;
  /** Path to the forge version JSON on disk */
  manifest: string;
}

export interface ForgeTemplate {
  /** Vanilla MC artifacts. Forge artifacts come from artifactScanner in the config. */
  artifacts: Artifact[];
  vars: ValDefs;
  command: Launch;
}

export async function forge(options: ForgeOptions): Promise<ForgeTemplate> {
  const { client } = await fetchClient(options.version);
  const mc = await clientToTemplate(client);

  const raw = JSON.parse(await readFile(options.manifest, 'utf-8')) as unknown;
  const forgeManifest = parseForgeManifest(raw);

  const merged = normalizeForgeArgs(mergeArgs(client.args, forgeManifest.args));

  // Jars on forge's module path (-p) must be excluded from -cp or the JVM module
  // system breaks (named module vs unnamed module conflict).
  const onModulePath = modulePathArtifacts(merged);

  const allLibs = [...client.libraries, ...forgeManifest.libraries];
  const libPaths = allLibs
    .filter((l) => !onModulePath.has(l.artifact.path))
    .map((l) => ({
      rules: l.rules as unknown[],
      artifactPath: `\${library_directory}/${l.artifact.path}`,
    }));
  const classpathEntries = buildClasspath(
    libPaths,
    '${version_dir}/client.jar',
  );

  const vars: ValDefs = { ...mc.vars, classpath: classpathEntries };

  const command = buildLaunch(forgeManifest.mainClass, merged.game, merged.jvm);

  return { artifacts: mc.artifacts, vars, command };
}
