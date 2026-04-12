import type { Unifact, Unifest, ValDefs, Launch } from '@unifest/core';
import { valDefsFromRecord, concatValDefs, parseLaunch } from '@unifest/core';
import {
  type Client,
  fetchAssetManifest,
  latestRelease,
  fetchVersionManifest,
  findVersion,
  type Version,
} from '@unifest/minecraft';
import { allowOsRuleset, type OsOptions, parseValset } from '@unifest/rules';
import { mapLibraries, libraryToUnifact } from './mappers/libraries';
import { mapAssetIndex, mapAssetObjects } from './mappers/assets';
import { mapClientJar } from './mappers/client';
import { buildClasspath, buildLaunch } from './mappers/launch';

export interface MinecraftTemplate {
  artifacts: Unifact[];
  vars: ValDefs;
  command: Launch;
}

export async function minecraft(config?: {
  version?: string;
}): Promise<MinecraftTemplate> {
  return minecraftTemplate(config?.version);
}

export async function minecraftTemplate(
  versionId?: string,
): Promise<MinecraftTemplate> {
  const manifest = await fetchVersionManifest();
  const version = versionId
    ? findVersion(manifest, versionId)
    : latestRelease(manifest);
  if (!version) throw new Error(`Version '${versionId ?? 'latest'}' not found`);
  const res = await fetch(version.url);
  if (!res.ok)
    throw new Error(`Failed to fetch version JSON: ${res.statusText}`);
  const { parseClient } = await import('@unifest/minecraft');
  const client = parseClient(await res.json());
  return clientToTemplate(client);
}

export async function fetchClient(
  versionId?: string,
): Promise<{ version: Version; client: Client }> {
  const manifest = await fetchVersionManifest();
  const version = versionId
    ? findVersion(manifest, versionId)
    : latestRelease(manifest);
  if (!version) throw new Error(`Version '${versionId ?? 'latest'}' not found`);
  const res = await fetch(version.url);
  if (!res.ok)
    throw new Error(`Failed to fetch version JSON: ${res.statusText}`);
  const { parseClient } = await import('@unifest/minecraft');
  return { version, client: parseClient(await res.json()) };
}

export async function clientToTemplate(
  client: Client,
): Promise<MinecraftTemplate> {
  const manifest = await fetchAssetManifest(client.assetIndex.url);
  const unifacts: Unifact[] = [];

  unifacts.push(mapClientJar(client));
  unifacts.push(...mapLibraries(client.libraries));
  unifacts.push(mapAssetIndex(client.assetIndex));
  unifacts.push(...mapAssetObjects(manifest));

  const libPaths = client.libraries.map((l) => ({
    rules: l.rules as unknown[],
    artifactPath: `\${library_directory}/${l.artifact.path}`,
  }));

  const classpathEntries = buildClasspath(
    libPaths,
    '\${version_dir}/client.jar',
  );

  const vars = concatValDefs(
    valDefsFromRecord({
      root: '.',
      launcher_name: 'unifest',
      launcher_version: '0.1',
      version_type: client.metadata.type,
      version_name: client.id,
      game_directory: '\${root}/',
      assets_root: '\${root}/assets',
      game_assets: '\${assets_root}',
      assets_index_name: client.assetIndex.id,
      version_dir: '\${root}/versions/\${version_name}',
      library_directory: '\${root}/libraries',
      natives_directory: '\${version_dir}/natives',
      auth_player_name: '\${username}',
      auth_uuid: '\${uuid}',
      auth_session: '\${token}',
      auth_access_token: '\${token}',
      user_type: 'mojang',
      user_properties: '{}',
      clientid: '',
    }),
    [
      ['classpath_separator', { value: ';', rules: allowOsRuleset('windows') }],
      ['classpath_separator', { value: ':', rules: allowOsRuleset('linux') }],
      ['classpath_separator', { value: ':', rules: allowOsRuleset('osx') }],
      ...(classpathEntries as [string, { value: string; rules: unknown[] }][]),
    ],
  );

  const launch = buildLaunch(
    client.mainClass,
    client.args.game,
    client.args.jvm,
  );

  return { artifacts: unifacts, vars, command: launch };
}
