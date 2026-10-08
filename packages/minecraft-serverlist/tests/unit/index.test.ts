/**
 * The JS half of `@opys/minecraft-serverlist`: the typed surface and the
 * plugin closure.
 *
 * The NBT encoding, the grouping by ruleset and the artifacts are the
 * `opys-minecraft-serverlist` crate's and are tested there, against the bytes
 * the previous encoder wrote. What is left here is what only exists on this
 * side: that the plugin reaches the native call, that what comes back is a
 * usable contribution, and that it chains.
 */
import { describe, expect, it } from 'vitest';
import { blobId, type Artifact } from '@opys/core';
import type { Contribution } from '@opys/dev';
import { DEFAULT_PATH, serverlist } from '../../lib';

const ctx = { log: () => {}, configDir: '/tmp', mode: '' };

/** The bytes of the blob `artifact` is made of, read out of the contribution. */
function bytesOf(contribution: Contribution, artifact: Artifact): Buffer {
  if (!('blob' in artifact.source)) throw new Error('expected a blob source');
  const held = contribution.blobs![artifact.source.blob]!;
  if (!('bytes' in held)) throw new Error('expected the blob held as bytes');
  return Buffer.from(held.bytes, 'base64');
}

describe('serverlist', () => {
  it('is named "serverlist" and does nothing until it is built', () => {
    expect(serverlist({ servers: [{ name: 'A', ip: 'a' }] }).name).toBe(
      'serverlist',
    );
  });

  it('takes its default path from the crate', () => {
    expect(DEFAULT_PATH).toBe('${game_directory}/servers.dat');
  });

  it('builds one blob artifact whose name is the hash of its bytes', async () => {
    const contribution = await serverlist({
      servers: [{ name: 'Home', ip: 'play.example' }],
    }).build(ctx);
    expect(contribution.artifacts).toHaveLength(1);
    const [artifact] = contribution.artifacts!;
    const bytes = bytesOf(contribution, artifact!);
    expect(artifact).toEqual({
      path: DEFAULT_PATH,
      source: { blob: blobId(bytes) },
      size: bytes.length,
    });
    // NBT, with the entry in it.
    expect(bytes[0]).toBe(0x0a);
    expect(bytes.toString('utf8')).toContain('play.example');
  });

  it('puts the list where `to` says', async () => {
    const { artifacts } = await serverlist({
      servers: [],
      to: 'custom/servers.dat',
    }).build(ctx);
    expect(artifacts![0]!.path).toBe('custom/servers.dat');
  });

  it('takes rules in either spelling and splits the list by them', async () => {
    const contribution = await serverlist({
      servers: [
        { name: 'Always', ip: 'always' },
        { name: 'Linux', ip: 'linux', rules: 'allow.os.linux' },
        {
          name: 'Linux2',
          ip: 'linux2',
          rules: [{ action: 'allow', os: { name: 'linux' } }],
        },
      ],
    }).build(ctx);
    expect(contribution.artifacts!.map((a) => a.rules)).toEqual([
      undefined,
      'allow.os.linux',
    ]);
    const linux = bytesOf(contribution, contribution.artifacts![1]!);
    expect(linux.toString('utf8')).toContain('linux2');
    expect(Object.keys(contribution.blobs!)).toHaveLength(2);
  });

  it('chains: a rule added afterwards lands on the artifact, the blob stays', async () => {
    const contribution = await serverlist({ servers: [{ name: 'S', ip: 'x' }] })
      .addRule('**', 'allow.os.linux')
      .build(ctx);
    expect(contribution.artifacts![0]!.rules).toHaveLength(1);
    expect(Object.keys(contribution.blobs!)).toHaveLength(1);
  });

  it('surfaces a rule that does not parse as an error from build', async () => {
    const plugin = serverlist({
      servers: [{ name: 'A', ip: 'a', rules: 'allow.nonsense' }],
    });
    await expect(plugin.build(ctx)).rejects.toThrow();
  });
});
