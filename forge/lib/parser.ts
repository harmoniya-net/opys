import { z } from 'zod';
import {
  parseArguments,
  parseLibraries,
  type Arguments,
  type Library,
} from '@unifest/minecraft';

const ForgeManifestRawSchema = z.object({
  id: z.string(),
  inheritsFrom: z.string().optional(),
  mainClass: z.string(),
  arguments: z
    .object({
      game: z.array(z.unknown()).default([]),
      jvm: z.array(z.unknown()).default([]),
    })
    .optional(),
  minecraftArguments: z.string().optional(),
  libraries: z.array(z.unknown()).default([]),
});

export interface ForgeManifest {
  readonly id: string;
  readonly inheritsFrom?: string;
  readonly mainClass: string;
  readonly args: Arguments;
  readonly libraries: Library[];
}

export function parseForgeManifest(raw: unknown): ForgeManifest {
  const data = ForgeManifestRawSchema.parse(raw);
  const argsRaw = data.arguments ?? data.minecraftArguments;
  const args =
    argsRaw != null
      ? parseArguments(argsRaw)
      : { game: [], jvm: [], legacy: false };
  return {
    id: data.id,
    inheritsFrom: data.inheritsFrom,
    mainClass: data.mainClass,
    args,
    libraries: parseLibraries(data.libraries),
  };
}
