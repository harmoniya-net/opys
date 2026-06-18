import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { read } from 'nbtify';
import { serverlist } from '../../lib';

const ctx = { log: () => {}, configDir: '/tmp', mode: '' };

/** Decode the base64 `bytes` source back into a Buffer. */
function bytesOf(source: { kind: string; bytes?: string }): Buffer {
  return Buffer.from(source.bytes!, 'base64');
}

/** Decode a `servers.dat` buffer back into its `servers` list. */
async function decodeServers(
  buf: Buffer,
): Promise<{ name: string; ip: string }[]> {
  const nbt = await read<{ servers?: { name: string; ip: string }[] }>(buf, {
    rootName: true,
    endian: 'big',
    compression: null,
    bedrockLevel: false,
    strict: true,
  });
  return nbt.data.servers ?? [];
}

/** Build a serverlist plugin and return its single artifact. */
async function buildArtifact(
  servers: Parameters<typeof serverlist>[0],
  options?: Parameters<typeof serverlist>[1],
) {
  const contribution = await serverlist(servers, options).build(ctx);
  return contribution.artifacts![0]!;
}

describe('serverlist', () => {
  it('is named "serverlist"', () => {
    expect(serverlist([]).name).toBe('serverlist');
  });

  it('returns a single artifact at the default path', async () => {
    const contribution = await serverlist([
      { name: 'Home', ip: 'play.example' },
    ]).build(ctx);
    expect(contribution.artifacts).toHaveLength(1);
    expect(contribution.artifacts![0]!.path).toBe(
      '${game_directory}/servers.dat',
    );
    expect(contribution.artifacts![0]!.rules).toEqual([]);
  });

  it('honours a custom path', async () => {
    const art = await buildArtifact([], { path: 'custom/servers.dat' });
    expect(art.path).toBe('custom/servers.dat');
  });

  it('emits a bytes source whose declared size matches the payload', async () => {
    const art = await buildArtifact([{ name: 'A', ip: 'a' }]);
    const src = art.source as { kind: string; bytes?: string };
    expect(src.kind).toBe('bytes');
    expect(bytesOf(src).length).toBe(art.size);
  });

  it('encodes an NBT compound starting with TAG_Compound (0x0a)', async () => {
    const art = await buildArtifact([]);
    const buf = bytesOf(art.source as { kind: string; bytes?: string });
    expect(buf[0]).toBe(0x0a);
  });

  it('writes the server count as a big-endian int32 in the list header', async () => {
    const servers = [
      { name: 'One', ip: 'one' },
      { name: 'Two', ip: 'two' },
      { name: 'Three', ip: 'three' },
    ];
    const art = await buildArtifact(servers);
    const buf = bytesOf(art.source as { kind: string; bytes?: string });
    // root(1) + nameLen(2) + listTagId(1) + nameLen(2) + 'servers'(7)
    //   + listElemTag(1) => count int32 at offset 14
    const count = buf.readInt32BE(14);
    expect(count).toBe(3);
    expect(await decodeServers(buf)).toEqual(servers);
  });

  it('embeds server names and ips as UTF-8 into the payload', async () => {
    const art = await buildArtifact([{ name: 'MyServer', ip: '1.2.3.4' }]);
    const buf = bytesOf(art.source as { kind: string; bytes?: string });
    const text = buf.toString('utf8');
    expect(text).toContain('MyServer');
    expect(text).toContain('1.2.3.4');
    expect(text).toContain('servers');
    expect(await decodeServers(buf)).toEqual([
      { name: 'MyServer', ip: '1.2.3.4' },
    ]);
  });

  it('produces an empty-list payload for no servers', async () => {
    const art = await buildArtifact([]);
    const buf = bytesOf(art.source as { kind: string; bytes?: string });
    expect(buf.readInt32BE(14)).toBe(0);
    expect(await decodeServers(buf)).toEqual([]);
  });

  it('grows the payload with each added server', async () => {
    const one = (await buildArtifact([{ name: 'A', ip: 'a' }])).size!;
    const two = (
      await buildArtifact([
        { name: 'A', ip: 'a' },
        { name: 'B', ip: 'b' },
      ])
    ).size!;
    expect(two).toBeGreaterThan(one);
  });

  it('sets sha1 integrity matching the encoded bytes', async () => {
    const art = await buildArtifact([{ name: 'S', ip: '1.2.3.4' }]);
    const src = art.source as { kind: string; bytes?: string };
    const buf = Buffer.from(src.bytes!, 'base64');
    const expected = createHash('sha1').update(buf).digest('hex');
    expect(art.integrity).toEqual({ sha1: expected });
  });

  it('supports addRule via ChainablePlugin', async () => {
    const contribution = await serverlist([{ name: 'S', ip: 'x' }])
      .addRule('**', 'allow.os.linux')
      .build(ctx);
    expect(contribution.artifacts![0]!.rules).toHaveLength(1);
  });

  it('entries without rules all go into a single always-on artifact', async () => {
    const contribution = await serverlist([
      { name: 'A', ip: 'a' },
      { name: 'B', ip: 'b' },
    ]).build(ctx);
    expect(contribution.artifacts).toHaveLength(1);
    expect(contribution.artifacts![0]!.rules).toEqual([]);
    const buf = bytesOf(
      contribution.artifacts![0]!.source as { kind: string; bytes?: string },
    );
    expect(await decodeServers(buf)).toEqual([
      { name: 'A', ip: 'a' },
      { name: 'B', ip: 'b' },
    ]);
  });

  it('entries with rules produce a separate artifact per distinct ruleset', async () => {
    const contribution = await serverlist([
      { name: 'Always', ip: 'always' },
      { name: 'LinuxOnly', ip: 'linux', rules: 'allow.os.linux' },
      { name: 'WinOnly', ip: 'win', rules: 'allow.os.windows' },
    ]).build(ctx);
    expect(contribution.artifacts).toHaveLength(3);
    const [base, linux, win] = contribution.artifacts!;
    expect(base!.rules).toEqual([]);
    expect(linux!.rules).toEqual([{ action: 'allow', os: { name: 'linux' } }]);
    expect(win!.rules).toEqual([{ action: 'allow', os: { name: 'windows' } }]);
    expect(
      await decodeServers(
        bytesOf(base!.source as { kind: string; bytes?: string }),
      ),
    ).toEqual([{ name: 'Always', ip: 'always' }]);
    expect(
      await decodeServers(
        bytesOf(linux!.source as { kind: string; bytes?: string }),
      ),
    ).toEqual([{ name: 'LinuxOnly', ip: 'linux' }]);
  });

  it('groups entries sharing the same ruleset into one artifact', async () => {
    const contribution = await serverlist([
      { name: 'A', ip: 'a', rules: 'allow.os.linux' },
      { name: 'B', ip: 'b', rules: 'allow.os.linux' },
    ]).build(ctx);
    expect(contribution.artifacts).toHaveLength(1);
    const buf = bytesOf(
      contribution.artifacts![0]!.source as { kind: string; bytes?: string },
    );
    expect(await decodeServers(buf)).toEqual([
      { name: 'A', ip: 'a' },
      { name: 'B', ip: 'b' },
    ]);
  });

  it('all artifacts share the same path', async () => {
    const contribution = await serverlist([
      { name: 'A', ip: 'a' },
      { name: 'B', ip: 'b', rules: 'allow.os.linux' },
    ]).build(ctx);
    const paths = contribution.artifacts!.map((a) => a.path);
    expect(new Set(paths).size).toBe(1);
    expect(paths[0]).toBe('${game_directory}/servers.dat');
  });
});
