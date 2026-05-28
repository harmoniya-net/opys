import { sourceBytes, type Artifact } from '@opys/core';
import { write } from 'nbtify';

export interface ServerEntry {
  name: string;
  ip: string;
}

export interface ServerlistOptions {
  /** Where the generated `servers.dat` lands. Defaults to `${game_directory}/servers.dat`. */
  path?: string;
}

/** Encode `servers` as an uncompressed big-endian Java NBT `servers.dat` buffer. */
async function encodeServersDat(servers: ServerEntry[]): Promise<Buffer> {
  const root = {
    servers: servers.map((entry) => ({ name: entry.name, ip: entry.ip })),
  };
  const bytes = await write(root, {
    rootName: '',
    endian: 'big',
    compression: null,
    bedrockLevel: false,
  });
  return Buffer.from(bytes);
}

export async function resolveServerlist(
  servers: ServerEntry[],
  options: ServerlistOptions = {},
): Promise<Artifact[]> {
  const path = options.path ?? '${game_directory}/servers.dat';
  const bytes = await encodeServersDat(servers);
  return [
    {
      path,
      source: sourceBytes(bytes),
      size: bytes.length,
      rules: [],
    },
  ];
}
