import {
  extractPick,
  type Artifact,
  type ConditionalVal,
  type OsArch,
  type OsName,
  type Ruleset,
  type ValDefs,
} from '@opys/core';
import {
  gitHubReleaseArtifacts,
  type GitHubRelease,
  type GitHubReleaseSelector,
} from '@opys/dev';

/** Source repo for the `dgpuj` launcher releases. */
export const DEFAULT_REPO = 'harmoniya-net/dgpuj';

/** One build target `dgpuj` publishes a release archive for. */
export interface DgpujPlatform {
  /** opys OS name. */
  os: OsName;
  /** opys CPU arch. */
  arch: OsArch;
  /** Rust target triple embedded in the release asset name. */
  target: string;
  /** Archive container the asset ships in. */
  ext: 'tar.gz' | 'zip';
  /** Binary name inside the archive (and on disk after extraction). */
  bin: 'dgpuj' | 'dgpuj.exe';
}

/** dgpuj's published targets — Windows/Linux/macOS × x86_64/aarch64. */
export const DEFAULT_PLATFORMS: readonly DgpujPlatform[] = [
  { os: 'windows', arch: 'x86_64', target: 'x86_64-pc-windows-msvc', ext: 'zip', bin: 'dgpuj.exe' }, // prettier-ignore
  { os: 'windows', arch: 'aarch64', target: 'aarch64-pc-windows-msvc', ext: 'zip', bin: 'dgpuj.exe' }, // prettier-ignore
  { os: 'linux', arch: 'x86_64', target: 'x86_64-unknown-linux-gnu', ext: 'tar.gz', bin: 'dgpuj' }, // prettier-ignore
  { os: 'osx', arch: 'aarch64', target: 'aarch64-apple-darwin', ext: 'tar.gz', bin: 'dgpuj' }, // prettier-ignore
  { os: 'osx', arch: 'x86_64', target: 'x86_64-apple-darwin', ext: 'tar.gz', bin: 'dgpuj' }, // prettier-ignore
];

export interface DgpujOptions {
  /** Release to use: `'latest'` (default), `'prerelease'`, or an exact tag (`'v0.3.0'`). */
  version?: GitHubReleaseSelector;
  /** Override the platform set (default {@link DEFAULT_PLATFORMS}). */
  platforms?: readonly DgpujPlatform[];
  /** Source repo `owner/name` (default {@link DEFAULT_REPO}). */
  repo?: string;
  /** GitHub token to raise API rate limits. */
  token?: string;
}

export interface DgpujTemplate {
  /** Per-target release archives, OS+arch-scoped, each extracting the binary. */
  artifacts: Artifact[];
  /** `dgpuj_dir` + per-OS `dgpuj_bin` — spread into your loader's vars. */
  vars: ValDefs;
  /** The resolved GitHub release. */
  release: GitHubRelease;
}

function osArchRuleset(os: OsName, arch: OsArch): Ruleset {
  return [
    { action: 'allow', os: { name: os } },
    { action: 'allow', os: { arch } },
  ];
}

/**
 * Resolve a `dgpuj` release and shape it into opys artifacts + vars.
 *
 * Each platform's archive (`dgpuj-<target>.{tar.gz,zip}`) becomes its own
 * OS+arch-scoped {@link Artifact} that downloads into `${dgpuj_dir}` and
 * extracts the single `dgpuj`/`dgpuj.exe` binary to `${dgpuj_dir}/<bin>` — only
 * the archive matching the launch platform installs. The per-OS `dgpuj_bin` var
 * points at the extracted binary, so a config wires
 * `command: ({ dgpuj }) => dgpuj.bin`.
 *
 * URL, size, and sha256 come straight from the GitHub release asset (the
 * tarball preserves the executable bit, which a bare download could not).
 */
export async function resolveDgpuj(
  options: DgpujOptions = {},
): Promise<DgpujTemplate> {
  const platforms = options.platforms ?? DEFAULT_PLATFORMS;

  const { release, artifacts } = await gitHubReleaseArtifacts(
    options.repo ?? DEFAULT_REPO,
    options.version ?? 'latest',
    {
      token: options.token,
      assets: platforms.map((p) => {
        const asset = `dgpuj-${p.target}.${p.ext}`;
        return {
          match: (a) => a.name === asset,
          description: asset,
          path: `\${dgpuj_dir}/${asset}`,
          rules: osArchRuleset(p.os, p.arch),
          extract: [extractPick(p.bin, `\${dgpuj_dir}/${p.bin}`)],
        };
      }),
    },
  );

  // `dgpuj_bin` only varies by OS (the `.exe` suffix on Windows); both arches
  // of an OS extract to the same path, so we don't split by arch here.
  const seenOses = new Set(platforms.map((p) => p.os));
  const binArms: ConditionalVal[] = [...seenOses].map((os) => ({
    value: `\${dgpuj_dir}/${os === 'windows' ? 'dgpuj.exe' : 'dgpuj'}`,
    rules: [{ action: 'allow', os: { name: os } }],
  }));

  const vars: ValDefs = {
    dgpuj_dir: '${root}/dgpuj',
    dgpuj_bin: binArms,
  };

  return { artifacts, vars, release };
}
