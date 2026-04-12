import { z } from 'zod';
import { parseArguments, type Arguments } from './arguments';
import { AssetIndexSchema, type AssetIndex } from './assets';
import { DownloadsSchema, type Downloads } from './downloads';
import { JavaVersionSchema, type JavaVersion } from './java';
import { parseLibraries, type Library } from './libraries';
import { LoggingSchema, type Logging } from './logging';

export interface ClientMetadata {
  readonly type: string;
  readonly time: string;
  readonly releaseTime: string;
  readonly minimumLauncherVersion: number;
  readonly assets: string;
  readonly complianceLevel: number;
}

export interface Client {
  readonly id: string;
  readonly java: JavaVersion;
  readonly assetIndex: AssetIndex;
  readonly downloads: Downloads;
  readonly mainClass: string;
  readonly libraries: Library[];
  readonly args: Arguments;
  readonly metadata: ClientMetadata;
  readonly logging?: Logging;
}

const ClientRawSchema = z.object({
  id: z.string(),
  javaVersion: JavaVersionSchema,
  assetIndex: AssetIndexSchema,
  downloads: DownloadsSchema,
  arguments: z.unknown().optional(),
  minecraftArguments: z.unknown().optional(),
  mainClass: z.string(),
  logging: LoggingSchema.optional(),
  libraries: z.array(z.unknown()),
  type: z.string(),
  time: z.string(),
  releaseTime: z.string(),
  minimumLauncherVersion: z.number(),
  assets: z.string(),
  complianceLevel: z.number().default(0),
});

export function parseClient(raw: unknown): Client {
  const data = ClientRawSchema.parse(raw);
  const argsRaw = data.arguments ?? data.minecraftArguments;
  if (argsRaw === undefined)
    throw new Error('Missing arguments in client JSON');
  return {
    id: data.id,
    java: data.javaVersion,
    assetIndex: data.assetIndex,
    downloads: data.downloads,
    mainClass: data.mainClass,
    libraries: parseLibraries(data.libraries),
    args: parseArguments(argsRaw),
    metadata: {
      type: data.type,
      time: data.time,
      releaseTime: data.releaseTime,
      minimumLauncherVersion: data.minimumLauncherVersion,
      assets: data.assets,
      complianceLevel: data.complianceLevel,
    },
    logging: data.logging,
  };
}
