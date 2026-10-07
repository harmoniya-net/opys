import {
  blobBytes,
  blobId,
  parseShortRuleset,
  sourceBlob,
  type Artifact,
  type BlobSource,
  type Ruleset,
} from '@opys/core';
import {
  definePlugin,
  type ChainablePlugin,
  type RulesetInput,
} from '@opys/dev';
import { write } from 'nbtify';

export interface ServerEntry {
  name: string;
  ip: string;
  /** Ruleset that gates this entry — omit or pass `[]` for always-on. */
  rules?: RulesetInput;
}

export interface ServerlistOptions {
  /** Where the generated `servers.dat` lands. Defaults to `${game_directory}/servers.dat`. */
  path?: string;
}

/** Encode `servers` as an uncompressed big-endian Java NBT `servers.dat` buffer. */
async function encodeServersDat(
  servers: Pick<ServerEntry, 'name' | 'ip'>[],
): Promise<Buffer> {
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

/** One generated `servers.dat`: the artifact, and the blob it is made of. */
interface Generated {
  artifact: Artifact;
  id: string;
  blob: BlobSource;
}

async function generate(
  entries: Pick<ServerEntry, 'name' | 'ip'>[],
  rules: Ruleset,
  path: string,
): Promise<Generated> {
  const bytes = await encodeServersDat(entries);
  const id = blobId(bytes);
  return {
    artifact: { path, source: sourceBlob(id), size: bytes.length, rules },
    id,
    blob: blobBytes(bytes),
  };
}

const contribution = (generated: Generated[]) => ({
  artifacts: generated.map((g) => g.artifact),
  blobs: Object.fromEntries(generated.map((g) => [g.id, g.blob])),
});

export function serverlist(
  servers: ServerEntry[],
  options: ServerlistOptions = {},
): ChainablePlugin {
  const path = options.path ?? '${game_directory}/servers.dat';
  return definePlugin({
    name: 'serverlist',
    async build() {
      // Group entries by their canonical (expanded) ruleset.
      const groups = new Map<
        string,
        { rules: Ruleset; entries: ServerEntry[] }
      >();
      for (const entry of servers) {
        const rules = parseShortRuleset(entry.rules ?? []);
        const key = JSON.stringify(rules);
        let group = groups.get(key);
        if (!group) {
          group = { rules, entries: [] };
          groups.set(key, group);
        }
        group.entries.push(entry);
      }

      // No entries at all → still emit an empty artifact.
      if (groups.size === 0) {
        return contribution([await generate([], [], path)]);
      }

      return contribution(
        await Promise.all(
          [...groups.values()].map((g) => generate(g.entries, g.rules, path)),
        ),
      );
    },
  });
}
