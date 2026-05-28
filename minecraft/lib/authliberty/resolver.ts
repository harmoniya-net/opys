/**
 * Resolver for AuthLiberty releases on a GitLab generic package registry.
 *
 * AuthLiberty's CI publishes the agent jar to two channels:
 *   - `latest`     — auto-updated from `main`, filename `authliberty-latest.jar`
 *   - `<version>`  — tagged releases, filename `authliberty-<version>.jar`
 *
 * Both ship as a single `.jar` in a generic package named `authliberty`.
 * GitLab exposes the file's sha256 via the `package_files` API, which we
 * use for integrity verification. The `latest` channel's sha256 changes
 * whenever a new build replaces it — that's resolved at template-build
 * time and frozen into the opys manifest.
 *
 * Accepted version forms:
 *   - Exact version: `'0.3'`
 *   - `'latest'`     — the auto-updating `latest` package version
 */

import { fetchWithRetry } from '@opys/core';

const DEFAULT_PROJECT = 'harmoniya/authliberty';
const DEFAULT_GITLAB = 'https://gitlab.com';
const PACKAGE_NAME = 'authliberty';

export interface AuthLibertyRelease {
  /** Package version, e.g. `0.3` or `latest`. */
  readonly version: string;
  /** Asset filename, e.g. `authliberty-0.3.jar`. */
  readonly filename: string;
  /** Direct download URL for the agent jar. */
  readonly url: string;
  /** Asset size in bytes. */
  readonly size: number;
  /** sha256 of the asset (hex), as reported by GitLab. */
  readonly sha256?: string;
  /** ISO timestamp the package was created. */
  readonly createdAt: string;
}

export interface ResolveAuthLibertyOptions {
  /** GitLab project path `group/name`. Default: `harmoniya/authliberty`. */
  project?: string;
  /** GitLab instance URL. Default: `https://gitlab.com`. */
  gitlab?: string;
  /** Optional GitLab token for private projects / higher rate limits. */
  token?: string;
}

interface RawPackage {
  id: number;
  name: string;
  version: string;
  package_type: string;
  status: string;
  created_at: string;
}

interface RawPackageFile {
  id: number;
  package_id: number;
  file_name: string;
  size: number;
  file_sha256: string | null;
  created_at: string;
}

function authHeaders(token: string | undefined): Record<string, string> {
  return token ? { 'PRIVATE-TOKEN': token } : {};
}

async function fetchPackages(
  base: string,
  projectPath: string,
  token: string | undefined,
): Promise<RawPackage[]> {
  const projectEnc = encodeURIComponent(projectPath);
  const url = `${base}/api/v4/projects/${projectEnc}/packages?package_type=generic&package_name=${PACKAGE_NAME}&per_page=100`;
  const res = await fetchWithRetry(url, { headers: authHeaders(token) });
  if (!res.ok) {
    throw new Error(
      `GitLab API ${res.status} ${res.statusText} listing packages for ${projectPath}`,
    );
  }
  const all = (await res.json()) as RawPackage[];
  // GitLab's `package_name` filter is a fuzzy match — narrow to exact name
  // and the generic registry, drop any non-default (broken/processing).
  return all.filter(
    (p) =>
      p.name === PACKAGE_NAME &&
      p.package_type === 'generic' &&
      p.status === 'default',
  );
}

async function fetchPackageFiles(
  base: string,
  projectPath: string,
  packageId: number,
  token: string | undefined,
): Promise<RawPackageFile[]> {
  const projectEnc = encodeURIComponent(projectPath);
  const url = `${base}/api/v4/projects/${projectEnc}/packages/${packageId}/package_files?per_page=100`;
  const res = await fetchWithRetry(url, { headers: authHeaders(token) });
  if (!res.ok) {
    throw new Error(
      `GitLab API ${res.status} ${res.statusText} listing files for package ${packageId}`,
    );
  }
  return (await res.json()) as RawPackageFile[];
}

/** Pick the .jar file. If multiple, prefer the most recently created one. */
function findJar(files: RawPackageFile[]): RawPackageFile | null {
  const jars = files.filter((f) => f.file_name.endsWith('.jar'));
  if (jars.length === 0) return null;
  return jars.reduce((latest, f) =>
    f.created_at > latest.created_at ? f : latest,
  );
}

export async function resolveAuthLibertyVersion(
  input: string,
  options: ResolveAuthLibertyOptions = {},
): Promise<AuthLibertyRelease> {
  const project = options.project ?? DEFAULT_PROJECT;
  const base = (options.gitlab ?? DEFAULT_GITLAB).replace(/\/+$/, '');
  const packages = await fetchPackages(base, project, options.token);

  const candidates = packages.filter((p) => p.version === input);
  if (candidates.length === 0) {
    const available = [...new Set(packages.map((p) => p.version))]
      .slice(0, 8)
      .join(', ');
    throw new Error(
      `AuthLiberty version '${input}' not found in ${project}. Available: ${available || '(none)'}`,
    );
  }
  // Same version can be re-published; the most recent package wins.
  const pkg = candidates.reduce((latest, p) =>
    p.created_at > latest.created_at ? p : latest,
  );

  const files = await fetchPackageFiles(base, project, pkg.id, options.token);
  const jar = findJar(files);
  if (!jar) {
    throw new Error(
      `AuthLiberty package ${project}@${pkg.version} has no .jar file`,
    );
  }

  const projectEnc = encodeURIComponent(project);
  const downloadUrl = `${base}/api/v4/projects/${projectEnc}/packages/generic/${PACKAGE_NAME}/${encodeURIComponent(pkg.version)}/${encodeURIComponent(jar.file_name)}`;

  return {
    version: pkg.version,
    filename: jar.file_name,
    url: downloadUrl,
    size: jar.size,
    sha256: jar.file_sha256 ?? undefined,
    createdAt: pkg.created_at,
  };
}
