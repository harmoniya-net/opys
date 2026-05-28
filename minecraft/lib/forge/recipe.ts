import { z } from 'zod';
import {
  parseArguments,
  parseLibraries,
  type Arguments,
  type Library,
  type MojangArgValue,
} from '@lanka/mojang';
import { type Ruleset, RuleSchema } from '@lanka/core';

/**
 * Forge version JSONs sometimes embed raw `../libraries/` paths (relative to a
 * `.minecraft/versions/<id>/` layout). Rewrite to the lanka var equivalent.
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

/**
 * Rewrite raw `../libraries/` paths in a recipe's parsed args to the lanka
 * `${library_directory}` var. Only the JVM args carry such paths.
 */
function fixArgs(args: Arguments): Arguments {
  return { ...args, jvm: args.jvm.map(fixArg) };
}

const LegacyRawSchema = z.object({
  type: z.literal('legacy'),
  forge: z.string(),
  id: z.string(),
  mainClass: z.string(),
  minecraftArguments: z.string(),
  libraries: z.array(z.unknown()).default([]),
});

const ProcessorRawSchema = z.object({
  type: z.literal('processor'),
  forge: z.string(),
  id: z.string(),
  mainClass: z.string(),
  arguments: z.object({
    game: z.array(z.unknown()).default([]),
    jvm: z.array(z.unknown()).default([]),
  }),
  libraries: z.array(z.unknown()).default([]),
});

const UnsupportedRawSchema = z.object({
  type: z.union([z.literal('jarmod'), z.literal('ancient')]),
  forge: z.string(),
  id: z.string(),
});

const RecipeRawSchema = z.discriminatedUnion('type', [
  LegacyRawSchema,
  ProcessorRawSchema,
  UnsupportedRawSchema,
]);

/**
 * Legacy-era library entry. Unlike Mojang's `Library` (which requires sha1 and
 * size), the Forge universal jar's slot inside a legacy recipe's `libraries[]`
 * is a placeholder: only `name` and `path` are present, and the consumer is
 * expected to fill in `url` and `md5` from the per-build entry's
 * `files.universal`. Every other library in the recipe carries full sha1+size.
 */
export interface LegacyLibrary {
  readonly name: string;
  readonly path: string;
  readonly url: string;
  readonly rules: Ruleset;
  readonly sha1?: string;
  readonly md5?: string;
  readonly size?: number;
}

const LegacyArtifactSchema = z.object({
  path: z.string(),
  url: z.string().default(''),
  sha1: z.string().optional(),
  size: z.number().optional(),
});

const LegacyLibRawSchema = z.object({
  name: z.string(),
  rules: z.array(RuleSchema).default([]),
  downloads: z
    .object({ artifact: LegacyArtifactSchema.optional() })
    .default({}),
});

function parseLegacyLibraries(
  raw: unknown[],
  forgeId: string,
  forgeUniversal?: { url?: string; md5?: string },
): LegacyLibrary[] {
  const universalCoord = `net.minecraftforge:forge:${forgeId}`;
  const out: LegacyLibrary[] = [];
  for (const item of raw) {
    const lib = LegacyLibRawSchema.parse(item);
    if (!lib.downloads.artifact) continue;
    const isUniversal = lib.name === universalCoord;
    const url =
      lib.downloads.artifact.url ||
      (isUniversal ? forgeUniversal?.url : undefined) ||
      '';
    if (!url) {
      throw new Error(
        `Legacy Forge library '${lib.name}' has no URL and no fallback was provided`,
      );
    }
    const md5 = isUniversal ? forgeUniversal?.md5 : undefined;
    out.push({
      name: lib.name,
      path: lib.downloads.artifact.path,
      url,
      rules: lib.rules,
      sha1: lib.downloads.artifact.sha1,
      md5,
      size: lib.downloads.artifact.size,
    });
  }
  return out;
}

export type ForgeRecipe =
  | {
      readonly kind: 'legacy';
      readonly forge: string;
      readonly id: string;
      readonly mainClass: string;
      readonly args: Arguments;
      readonly libraries: LegacyLibrary[];
    }
  | {
      readonly kind: 'processor';
      readonly forge: string;
      readonly id: string;
      readonly mainClass: string;
      readonly args: Arguments;
      readonly libraries: Library[];
    }
  | {
      readonly kind: 'unsupported';
      readonly type: 'jarmod' | 'ancient';
      readonly forge: string;
      readonly id: string;
    };

export interface ParseForgeRecipeOptions {
  /**
   * For legacy recipes, the Forge universal library's slot in `libraries[]`
   * is a placeholder (no URL, no hash). fuckforge serves the real values on
   * the per-build entry's `files.universal`. Pass them here and the parser
   * will splice them onto the universal entry so it gets a real integrity
   * check instead of being downloaded blind.
   */
  forgeUniversal?: { url?: string; md5?: string };
}

/**
 * Parses a fuckforge recipe document into a discriminated union over the four
 * Forge eras.
 */
export function parseForgeRecipe(
  raw: unknown,
  options: ParseForgeRecipeOptions = {},
): ForgeRecipe {
  const data = RecipeRawSchema.parse(raw);

  if (data.type === 'legacy') {
    return {
      kind: 'legacy',
      forge: data.forge,
      id: data.id,
      mainClass: data.mainClass,
      args: fixArgs(parseArguments(data.minecraftArguments)),
      libraries: parseLegacyLibraries(
        data.libraries,
        data.forge,
        options.forgeUniversal,
      ),
    };
  }
  if (data.type === 'processor') {
    return {
      kind: 'processor',
      forge: data.forge,
      id: data.id,
      mainClass: data.mainClass,
      args: fixArgs(parseArguments(data.arguments)),
      libraries: parseLibraries(data.libraries),
    };
  }
  return {
    kind: 'unsupported',
    type: data.type,
    forge: data.forge,
    id: data.id,
  };
}
