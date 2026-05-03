import { z } from 'zod';

const ModLoaderSchema = z.object({
  id: z.string(),
  primary: z.boolean().default(false),
});

const FileEntrySchema = z.object({
  projectID: z.number().int(),
  fileID: z.number().int(),
  required: z.boolean().default(true),
});

const ManifestRawSchema = z.object({
  manifestType: z.literal('minecraftModpack').optional(),
  manifestVersion: z.number().optional(),
  name: z.string().optional(),
  version: z.string().optional(),
  author: z.string().optional(),
  minecraft: z
    .object({
      version: z.string(),
      modLoaders: z.array(ModLoaderSchema).default([]),
    })
    .optional(),
  files: z.array(FileEntrySchema).default([]),
  overrides: z.string().optional(),
});

export interface CurseForgeFileEntry {
  readonly projectID: number;
  readonly fileID: number;
  readonly required: boolean;
}

export interface CurseForgeModLoader {
  readonly id: string;
  readonly primary: boolean;
}

export interface CurseForgeManifest {
  readonly name?: string;
  readonly version?: string;
  readonly author?: string;
  readonly minecraft?: {
    readonly version: string;
    readonly modLoaders: CurseForgeModLoader[];
  };
  readonly files: CurseForgeFileEntry[];
  readonly overrides?: string;
}

export function parseCurseForgeManifest(raw: unknown): CurseForgeManifest {
  const data = ManifestRawSchema.parse(raw);
  return {
    name: data.name,
    version: data.version,
    author: data.author,
    minecraft: data.minecraft,
    files: data.files,
    overrides: data.overrides,
  };
}
