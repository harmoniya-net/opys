import { describe, expect, it } from 'vitest';
import { parseClient } from '../../lib/client/client';

const MINIMAL_CLIENT = {
  id: '1.20.1',
  javaVersion: { component: 'java-runtime-gamma', majorVersion: 17 },
  assetIndex: {
    id: '1.20',
    sha1: 'abc',
    size: 100,
    totalSize: 200,
    url: 'https://example.com/assets.json',
  },
  downloads: {
    client: { sha1: 'xyz', size: 500, url: 'https://example.com/client.jar' },
  },
  mainClass: 'net.minecraft.client.main.Main',
  libraries: [],
  arguments: { game: ['--username', '${auth_player_name}'], jvm: [] },
  type: 'release',
  time: '2023-06-12T14:00:00+00:00',
  releaseTime: '2023-06-12T14:00:00+00:00',
  minimumLauncherVersion: 21,
  assets: '1.20',
  complianceLevel: 1,
};

describe('parseClient', () => {
  it('parses a minimal client JSON', () => {
    const c = parseClient(MINIMAL_CLIENT);
    expect(c.id).toBe('1.20.1');
    expect(c.mainClass).toBe('net.minecraft.client.main.Main');
    expect(c.libraries).toHaveLength(0);
    expect(c.args.legacy).toBe(false);
  });

  it('throws when arguments are missing', () => {
    const raw = { ...MINIMAL_CLIENT, arguments: undefined };
    expect(() => parseClient(raw)).toThrow('Missing arguments');
  });
});
