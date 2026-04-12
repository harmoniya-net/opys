import { z } from 'zod';
import type { MojangRule } from './libraries';

/** Raw Mojang argument: a plain string or a conditional { rules, value } object. */
export type MojangArgValue =
  | string
  | { rules: MojangRule[]; value: string | string[] };

export interface Arguments {
  readonly game: MojangArgValue[];
  readonly jvm: MojangArgValue[];
  /** True if parsed from the legacy `minecraftArguments` string field. */
  readonly legacy: boolean;
}

/** Legacy JVM arguments used when the version JSON has `minecraftArguments`. */
export const LEGACY_JVM_ARGS: MojangArgValue[] = [
  '-Djava.library.path=${natives_directory}',
  '-cp',
  '${classpath}',
];

const MojangRuleSchema = z.union([
  z.object({
    action: z.string(),
    os: z.record(z.string(), z.string().optional()),
  }),
  z.object({ action: z.string(), features: z.record(z.string(), z.boolean()) }),
  z.object({ action: z.string() }),
]) as z.ZodType<MojangRule>;

const MojangArgSchema: z.ZodType<MojangArgValue> = z.union([
  z.string(),
  z.object({
    rules: z.array(MojangRuleSchema),
    value: z.union([z.string(), z.array(z.string())]),
  }),
]);

const ArgumentsObjectSchema = z.object({
  game: z.array(MojangArgSchema).default([]),
  jvm: z.array(MojangArgSchema).default([]),
});

/**
 * Merge a patch version's args onto a base version's args (inheritsFrom semantics).
 * When patch is legacy it has no structured jvm/game delta — base is returned as-is.
 */
export function mergeArgs(base: Arguments, patch: Arguments): Arguments {
  if (patch.legacy) return base;
  return {
    jvm: [...base.jvm, ...patch.jvm],
    game: [...base.game, ...patch.game],
    legacy: false,
  };
}

export function parseArguments(raw: unknown): Arguments {
  if (typeof raw === 'string') {
    const game = raw.split(/\s+/).filter(Boolean) as MojangArgValue[];
    return { game, jvm: LEGACY_JVM_ARGS, legacy: true };
  }
  const parsed = ArgumentsObjectSchema.parse(raw);
  return { game: parsed.game, jvm: parsed.jvm, legacy: false };
}
