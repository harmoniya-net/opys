import { z } from 'zod';

export class DownloadsFile {
  constructor(
    public readonly sha1: string,
    public readonly size: number,
    public readonly url: string,
  ) {}

  public static CODEC = z.codec(
    z.object({
      sha1: z.string(),
      size: z.number(),
      url: z.string(),
    }),
    z.instanceof(DownloadsFile),
    {
      decode: (data) => new DownloadsFile(data.sha1, data.size, data.url),
      encode: (file) => ({
        sha1: file.sha1,
        size: file.size,
        url: file.url,
      }),
    },
  );
}

export class Downloads {
  constructor(
    public readonly client: DownloadsFile,
    public readonly clientMappings?: DownloadsFile,
    public readonly server?: DownloadsFile,
    public readonly windowsServer?: DownloadsFile,
    public readonly serverMappings?: DownloadsFile,
  ) {}

  public static CODEC = z.codec(
    z.object({
      client: DownloadsFile.CODEC,
      clientMappings: DownloadsFile.CODEC.optional(),
      server: DownloadsFile.CODEC.optional(),
      windowsServer: DownloadsFile.CODEC.optional(),
      serverMappings: DownloadsFile.CODEC.optional(),
    }),
    z.instanceof(Downloads),
    {
      decode: (data) =>
        new Downloads(
          data.client,
          data.clientMappings,
          data.server,
          data.windowsServer,
          data.serverMappings,
        ),
      encode: (downloads) => ({
        client: downloads.client,
        clientMappings: downloads.clientMappings,
        server: downloads.server,
        windowsServer: downloads.windowsServer,
        serverMappings: downloads.serverMappings,
      }),
    },
  );
}
