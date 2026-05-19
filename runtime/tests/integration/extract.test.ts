/**
 * Live integration test — downloads a real Eclipse Adoptium JRE archive,
 * extracts it through runtime's `extractArchive`, and runs the resulting
 * `java -version`. Run with `npm run test:int`.
 *
 * This is the regression guard for tar extraction: a hand-rolled tar reader
 * once produced a truncated `libjli.so`, so a freshly "installed" JDK died
 * at launch with `error while loading shared libraries: … file too short`.
 * Parsing a real ~40 MB JRE tarball and then actually executing the binary
 * is the only test that would have caught that.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { readdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { extractArchive } from '../../lib/archive';
import { currentPlatform } from '../../lib/platform';

const execFileAsync = promisify(execFile);

const ADOPTIUM = 'https://api.adoptium.net/v3';
const ADOPTIUM_OS: Record<string, string> = {
  linux: 'linux',
  osx: 'mac',
  windows: 'windows',
};
const ADOPTIUM_ARCH: Record<string, string> = {
  x86_64: 'x64',
  aarch64: 'aarch64',
};

interface JrePackage {
  link: string;
  isTar: boolean;
}

/** Resolve an Adoptium JRE 8 download for the machine running the test. */
async function resolveJre(): Promise<JrePackage | null> {
  const plat = currentPlatform();
  const os = ADOPTIUM_OS[plat.name];
  const arch = ADOPTIUM_ARCH[plat.arch];
  if (!os || !arch) return null;
  const q = new URLSearchParams({
    image_type: 'jre',
    os,
    architecture: arch,
    jvm_impl: 'hotspot',
    heap_size: 'normal',
    vendor: 'eclipse',
    page_size: '1',
    sort_order: 'DESC',
  });
  const res = await fetch(`${ADOPTIUM}/assets/feature_releases/8/ga?${q}`);
  if (!res.ok) return null;
  const releases = (await res.json()) as {
    binaries: { package: { link: string } }[];
  }[];
  const link = releases[0]?.binaries[0]?.package.link;
  if (!link) return null;
  // Windows ships a .zip; everyone else a .tar.gz — both go through
  // `extractArchive`, which dispatches on the extension.
  return { link, isTar: link.endsWith('.tar.gz') || link.endsWith('.tgz') };
}

/** Find the extracted `java` executable (one top-level dir, OS-specific path). */
async function findJava(root: string): Promise<string | null> {
  const exe = currentPlatform().name === 'windows' ? 'java.exe' : 'java';
  const tails =
    currentPlatform().name === 'osx'
      ? [join('Contents', 'Home', 'bin', exe), join('bin', exe)]
      : [join('bin', exe)];
  for (const top of await readdir(root)) {
    for (const tail of tails) {
      const candidate = join(root, top, tail);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'torba-jre-'));
});
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('runtime extractArchive (live, real Adoptium JRE)', () => {
  it('extracts a real JRE archive into a working `java`', async () => {
    const jre = await resolveJre();
    expect(jre, 'no Adoptium JRE 8 for this platform').not.toBeNull();

    // Download the archive to disk — `extractArchive` reads a file path.
    const archive = join(dir, jre!.isTar ? 'jre.tar.gz' : 'jre.zip');
    const bytes = new Uint8Array(await (await fetch(jre!.link)).arrayBuffer());
    expect(bytes.length).toBeGreaterThan(10_000_000); // a real JRE, ~40 MB
    await writeFile(archive, bytes);

    const out = join(dir, 'jre');
    await extractArchive(archive, out, undefined, undefined);

    // The extracted tree must contain a runnable `java` — if any file
    // (e.g. libjli.so) came out truncated, this exec fails exactly the
    // way the original bug report did.
    const java = await findJava(out);
    expect(java, 'no java executable in the extracted tree').not.toBeNull();

    const { stdout, stderr } = await execFileAsync(java!, ['-version']);
    expect(`${stdout}${stderr}`).toMatch(/version "1\.8/);
  }, 300_000);
});
