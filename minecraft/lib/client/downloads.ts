import { z } from 'zod';

export interface DownloadsFile {
  readonly sha1: string;
  readonly size: number;
  readonly url: string;
}

export interface Downloads {
  readonly client: DownloadsFile;
  readonly clientMappings?: DownloadsFile;
  readonly server?: DownloadsFile;
  readonly windowsServer?: DownloadsFile;
  readonly serverMappings?: DownloadsFile;
}

const DownloadsFileSchema = z.object({
  sha1: z.string(),
  size: z.number(),
  url: z.string(),
});

export const DownloadsSchema = z.object({
  client: DownloadsFileSchema,
  clientMappings: DownloadsFileSchema.optional(),
  server: DownloadsFileSchema.optional(),
  windowsServer: DownloadsFileSchema.optional(),
  serverMappings: DownloadsFileSchema.optional(),
});
