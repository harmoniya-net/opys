import { z } from 'zod';
import {
  parseArguments,
  parseLibraries,
  type Arguments,
  type Library,
} from '@opys/mojang';
import type { MojangRuleset } from '@opys/core';

/**
 * Local copy of the Mojang rule schema.
 *
 * TEMPORARY. `@opys/mojang-rules` no longer ships zod — validation moved to
 * serde behind the napi boundary — but this parser still needs a zod schema
 * it can compose into `LegacyLibRawSchema` below. The rules it decodes are
 * transit-only: they are carried straight through to `LegacyLibrary.rules`
 * and never inspected here. Removed when `forge` itself is ported.
 */
const RuleActionSchema = z.enum(['allow', 'disallow']);
const OsNameSchema = z.enum(['linux', 'windows', 'osx']);
const OsArchSchema = z.enum(['x86', 'x86_64', 'arm', 'aarch64', 'any']);
const OsConstraintSchema = z.object({
  name: OsNameSchema.optional(),
  version: z.string().optional(),
  arch: OsArchSchema.optional(),
});
const RuleSchema = z.union([
  z.object({ action: RuleActionSchema, os: OsConstraintSchema }),
  z.object({
    action: RuleActionSchema,
    features: z.record(z.string(), z.boolean()),
  }),
  z.object({ action: RuleActionSchema }),
]);

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
 * Legacy-era library entry. Mojang's `Library` requires sha1 and size; a
 * legacy recipe may carry neither, because the 1.6.x-era artifacts are gone
 * from every maven and fuckforge can only serve the URL it found in the
 * install profile. Those builds are unusable either way — the Forge universal
 * jar itself 404s — but the parser stays total rather than rejecting them.
 */
export interface LegacyLibrary {
  readonly name: string;
  readonly path: string;
  readonly url: string;
  readonly rules: MojangRuleset;
  readonly sha1?: string;
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

function parseLegacyLibraries(raw: unknown[]): LegacyLibrary[] {
  const out: LegacyLibrary[] = [];
  for (const item of raw) {
    const lib = LegacyLibRawSchema.parse(item);
    const artifact = lib.downloads.artifact;
    if (!artifact) continue;
    if (!artifact.url) {
      throw new Error(`Legacy Forge library '${lib.name}' has no download URL`);
    }
    out.push({
      name: lib.name,
      path: artifact.path,
      url: artifact.url,
      rules: lib.rules,
      sha1: artifact.sha1,
      size: artifact.size,
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

/**
 * Parses a fuckforge recipe document into a discriminated union over the four
 * Forge eras.
 */
export function parseForgeRecipe(raw: unknown): ForgeRecipe {
  const data = RecipeRawSchema.parse(raw);

  if (data.type === 'legacy') {
    return {
      kind: 'legacy',
      forge: data.forge,
      id: data.id,
      mainClass: data.mainClass,
      args: parseArguments(data.minecraftArguments),
      libraries: parseLegacyLibraries(data.libraries),
    };
  }
  if (data.type === 'processor') {
    return {
      kind: 'processor',
      forge: data.forge,
      id: data.id,
      mainClass: data.mainClass,
      args: parseArguments(data.arguments),
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
