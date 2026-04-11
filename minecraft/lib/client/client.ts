import { z } from 'zod';
import { Arguments } from './arguments';
import { AssetIndex } from './assets';
import { Downloads } from './downloads';
import { JavaVersion } from './java';
import { Libraries } from './libraries';
import { LoggingSchema } from './logging';

export class ClientMetadata {
  constructor(
    public readonly type: string,
    public readonly time: string,
    public readonly releaseTime: string,
    public readonly minimumLauncherVersion: number,
    public readonly assets: string,
    public readonly complianceLevel: number = 0,
  ) {}
}

export class Client {
  constructor(
    public readonly id: string,
    public readonly java: JavaVersion,
    public readonly assetIndex: AssetIndex,
    public readonly downloads: Downloads,
    public readonly mainClass: string,
    public readonly libraries: Libraries,
    public readonly args: Arguments,
    public readonly metadata: ClientMetadata,
    public readonly logging?: z.infer<typeof LoggingSchema>,
  ) {}

  public static CODEC = z.codec(
    z.object({
      id: z.string(),
      javaVersion: JavaVersion.CODEC,
      assetIndex: AssetIndex.CODEC,
      downloads: Downloads.CODEC,
      arguments: Arguments.CODEC.optional(),
      minecraftArguments: Arguments.CODEC.optional(),
      mainClass: z.string(),
      logging: LoggingSchema.optional(),
      libraries: Libraries.CODEC,
      type: z.string(),
      time: z.string(),
      releaseTime: z.string(),
      minimumLauncherVersion: z.number(),
      assets: z.string(),
      complianceLevel: z.number().default(0),
    }),
    z.instanceof(Client),
    {
      decode: (data) => {
        const metadata = new ClientMetadata(
          data.type,
          data.time,
          data.releaseTime,
          data.minimumLauncherVersion,
          data.assets,
          data.complianceLevel,
        );

        const args = data.arguments ?? data.minecraftArguments;
        if (!args) {
          throw new Error('Missing arguments');
        }

        return new Client(
          data.id,
          data.javaVersion,
          data.assetIndex,
          data.downloads,
          data.mainClass,
          data.libraries,
          args,
          metadata,
          data.logging,
        );
      },
      encode: (client) => {
        return {
          id: client.id,
          javaVersion: client.java,
          assetIndex: client.assetIndex,
          downloads: client.downloads,
          mainClass: client.mainClass,
          logging: client.logging,
          libraries: client.libraries,
          arguments: client.args,
          type: client.metadata.type,
          time: client.metadata.time,
          releaseTime: client.metadata.releaseTime,
          minimumLauncherVersion: client.metadata.minimumLauncherVersion,
          assets: client.metadata.assets,
          complianceLevel: client.metadata.complianceLevel,
        };
      },
    },
  );
}
