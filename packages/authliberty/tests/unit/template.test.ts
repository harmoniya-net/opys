import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAuthliberty } from '../../lib/template';

afterEach(() => vi.unstubAllGlobals());

const pkg = {
  id: 100,
  name: 'authliberty',
  version: '0.3',
  package_type: 'generic',
  status: 'default',
  created_at: '2024-01-01T00:00:00Z',
};

function file(extra: Record<string, unknown> = {}) {
  return {
    id: 1,
    package_id: 100,
    file_name: 'authliberty-0.3.jar',
    size: 4096,
    file_sha256: 'beef',
    created_at: '2024-01-01T00:00:00Z',
    ...extra,
  };
}

function mockApi(theFile = file()) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.includes('/package_files')
        ? new Response(JSON.stringify([theFile]))
        : new Response(JSON.stringify([pkg])),
    ),
  );
}

/** Flatten a Valset's Val values into a string list. */
function flat(valset: { value: string[] }[]): string[] {
  return valset.flatMap((v) => v.value);
}

describe('resolveAuthliberty', () => {
  it('emits the agent jar artifact at a maven-style path', async () => {
    mockApi();
    const t = await resolveAuthliberty({ version: '0.3' });
    expect(t.artifacts).toHaveLength(1);
    const art = t.artifacts[0]!;
    expect(art.path).toBe(
      '${library_directory}/net/harmoniya/authliberty/0.3/authliberty-0.3.jar',
    );
    expect(art.source).toEqual({
      kind: 'url',
      url: t.release.url,
    });
    expect(art.size).toBe(4096);
    expect(art.integrity).toEqual({ sha256: 'beef' });
  });

  it('omits integrity when the release has no sha256', async () => {
    mockApi(file({ file_sha256: null }));
    const t = await resolveAuthliberty({ version: '0.3' });
    expect(t.artifacts[0]!.integrity).toBeUndefined();
  });

  it('always emits a -javaagent JVM arg pointing at the jar', async () => {
    mockApi();
    const t = await resolveAuthliberty({ version: '0.3' });
    expect(flat(t.jvmArgs)).toEqual([
      '-javaagent:${library_directory}/net/harmoniya/authliberty/0.3/authliberty-0.3.jar',
    ]);
  });

  it('adds -D host flags from a host map', async () => {
    mockApi();
    const t = await resolveAuthliberty({
      version: '0.3',
      hosts: {
        auth: 'https://yggdrasil.test',
        session: 'https://session.test',
      },
    });
    const args = flat(t.jvmArgs);
    expect(args).toContain('-Dminecraft.api.auth.host=https://yggdrasil.test');
    expect(args).toContain('-Dminecraft.api.session.host=https://session.test');
    expect(args.some((a) => a.includes('account.host'))).toBe(false);
  });

  it('accepts a host-resolver function', async () => {
    mockApi();
    const t = await resolveAuthliberty({
      version: '0.3',
      hosts: (server) =>
        server === 'services' ? 'https://svc.test' : undefined,
    });
    const args = flat(t.jvmArgs);
    expect(args).toContain('-Dminecraft.api.services.host=https://svc.test');
    expect(args.filter((a) => a.startsWith('-D'))).toHaveLength(1);
  });

  it('skips empty-string host overrides', async () => {
    mockApi();
    const t = await resolveAuthliberty({
      version: '0.3',
      hosts: { auth: '' },
    });
    expect(flat(t.jvmArgs).filter((a) => a.startsWith('-D'))).toHaveLength(0);
  });

  it('exposes the resolved release metadata', async () => {
    mockApi();
    const t = await resolveAuthliberty({ version: '0.3' });
    expect(t.release.version).toBe('0.3');
    expect(t.release.filename).toBe('authliberty-0.3.jar');
  });

  it('emits all four host flags when every host is set', async () => {
    mockApi();
    const t = await resolveAuthliberty({
      version: '0.3',
      hosts: {
        auth: 'https://a',
        account: 'https://b',
        session: 'https://c',
        services: 'https://d',
      },
    });
    expect(flat(t.jvmArgs).filter((a) => a.startsWith('-D'))).toHaveLength(4);
  });
});
