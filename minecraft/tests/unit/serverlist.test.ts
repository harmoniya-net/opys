import { describe, expect, it } from 'vitest';
import { read } from 'nbtify';
import { resolveServerlist } from '../../lib/serverlist';

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

describe('resolveServerlist', () => {
  it('returns a single artifact at the default path', async () => {
    const arts = await resolveServerlist([
      { name: 'Home', ip: 'play.example' },
    ]);
    expect(arts).toHaveLength(1);
    expect(arts[0]!.path).toBe('${game_directory}/servers.dat');
    expect(arts[0]!.rules).toEqual([]);
  });

  it('honours a custom path', async () => {
    const arts = await resolveServerlist([], { path: 'custom/servers.dat' });
    expect(arts[0]!.path).toBe('custom/servers.dat');
  });

  it('emits a bytes source whose declared size matches the payload', async () => {
    const arts = await resolveServerlist([{ name: 'A', ip: 'a' }]);
    const src = arts[0]!.source as { kind: string; bytes?: string };
    expect(src.kind).toBe('bytes');
    expect(bytesOf(src).length).toBe(arts[0]!.size);
  });

  it('encodes an NBT compound starting with TAG_Compound (0x0a)', async () => {
    const buf = bytesOf(
      (await resolveServerlist([]))[0]!.source as {
        kind: string;
        bytes?: string;
      },
    );
    expect(buf[0]).toBe(0x0a);
  });

  it('writes the server count as a big-endian int32 in the list header', async () => {
    const servers = [
      { name: 'One', ip: 'one' },
      { name: 'Two', ip: 'two' },
      { name: 'Three', ip: 'three' },
    ];
    const buf = bytesOf(
      (await resolveServerlist(servers))[0]!.source as {
        kind: string;
        bytes?: string;
      },
    );
    // root(1) + nameLen(2) + listTagId(1) + nameLen(2) + 'servers'(7)
    //   + listElemTag(1) => count int32 at offset 14
    const count = buf.readInt32BE(14);
    expect(count).toBe(3);
    expect(await decodeServers(buf)).toEqual(servers);
  });

  it('embeds server names and ips as UTF-8 into the payload', async () => {
    const buf = bytesOf(
      (await resolveServerlist([{ name: 'MyServer', ip: '1.2.3.4' }]))[0]!
        .source as {
        kind: string;
        bytes?: string;
      },
    );
    const text = buf.toString('utf8');
    expect(text).toContain('MyServer');
    expect(text).toContain('1.2.3.4');
    expect(text).toContain('servers');
    expect(await decodeServers(buf)).toEqual([
      { name: 'MyServer', ip: '1.2.3.4' },
    ]);
  });

  it('produces an empty-list payload for no servers', async () => {
    const buf = bytesOf(
      (await resolveServerlist([]))[0]!.source as {
        kind: string;
        bytes?: string;
      },
    );
    expect(buf.readInt32BE(14)).toBe(0);
    expect(await decodeServers(buf)).toEqual([]);
  });

  it('grows the payload with each added server', async () => {
    const one = (await resolveServerlist([{ name: 'A', ip: 'a' }]))[0]!.size!;
    const two = (
      await resolveServerlist([
        { name: 'A', ip: 'a' },
        { name: 'B', ip: 'b' },
      ])
    )[0]!.size!;
    expect(two).toBeGreaterThan(one);
  });
});
