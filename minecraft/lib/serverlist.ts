import { sourceBytes, type Artifact } from '@torba/core';

export interface ServerEntry {
  name: string;
  ip: string;
}

export interface ServerlistOptions {
  /** Where the generated `servers.dat` lands. Defaults to `${game_directory}/servers.dat`. */
  path?: string;
}

const TAG_END = 0;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;

function nbtString(value: string): Buffer {
  const utf8 = Buffer.from(value, 'utf8');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(utf8.length);
  return Buffer.concat([len, utf8]);
}

function namedString(name: string, value: string): Buffer {
  return Buffer.concat([
    Buffer.from([TAG_STRING]),
    nbtString(name),
    nbtString(value),
  ]);
}

function entryCompound(entry: ServerEntry): Buffer {
  return Buffer.concat([
    namedString('name', entry.name),
    namedString('ip', entry.ip),
    Buffer.from([TAG_END]),
  ]);
}

function encodeServersDat(servers: ServerEntry[]): Buffer {
  const count = Buffer.alloc(4);
  count.writeInt32BE(servers.length);
  const listPayload = Buffer.concat([
    Buffer.from([TAG_COMPOUND]),
    count,
    ...servers.map(entryCompound),
  ]);
  const root = Buffer.concat([
    Buffer.from([TAG_COMPOUND]),
    nbtString(''),
    Buffer.from([TAG_LIST]),
    nbtString('servers'),
    listPayload,
    Buffer.from([TAG_END]),
  ]);
  return root;
}

export function resolveServerlist(
  servers: ServerEntry[],
  options: ServerlistOptions = {},
): Artifact[] {
  const path = options.path ?? '${game_directory}/servers.dat';
  const bytes = encodeServersDat(servers);
  return [
    {
      path,
      source: sourceBytes(bytes),
      size: bytes.length,
      rules: [],
    },
  ];
}
