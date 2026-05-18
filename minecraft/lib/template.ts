import {
  fetchWithRetry,
  allowOsRuleset,
  type Artifact,
  type ValDefs,
  type Launch,
  type Val,
  type Valset,
  type ConditionalVal,
} from '@torba/core';
import {
  type Client,
  fetchAssetManifest,
  latestRelease,
  fetchVersionManifest,
  findVersion,
  type Version,
} from '@torba/mojang';
import { mapLibraries } from './mappers/libraries';
import { mapAssetIndex, mapAssetObjects } from './mappers/assets';
import { mapClientJar } from './mappers/client';
import { buildClasspath, buildLaunch } from './mappers/launch';

export interface MinecraftTemplate {
  artifacts: Artifact[];
  vars: ValDefs;
  /** Per-OS classpath arms (also baked into `vars.classpath`). */
  classpath: ConditionalVal[];
  /** Assembled Launch — drop straight into `manifest.launch`. */
  launch: Launch;
  /** JVM args alone, for composition (e.g. interleaving an auth `-javaagent`). */
  jvmArgs: Valset;
  /** Main class wrapped as a `Val` so it spreads into a `Valset`. Raw string at `mainClass.value[0]`. */
  mainClass: Val;
  /** Game args alone, for composition. */
  gameArgs: Valset;
}

export async function resolveMinecraft(config?: {
  version?: string;
}): Promise<MinecraftTemplate> {
  const { client } = await fetchClient(config?.version);
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
  const res = await fetchWithRetry(version.url);
  if (!res.ok)
    throw new Error(`Failed to fetch version JSON: ${res.statusText}`);
  const { parseClient } = await import('@torba/mojang');
  return { version, client: parseClient(await res.json()) };
}

export async function clientToTemplate(
  client: Client,
): Promise<MinecraftTemplate> {
  const manifest = await fetchAssetManifest(client.assetIndex.url);
  const artifacts: Artifact[] = [];

  artifacts.push(mapClientJar(client));
  artifacts.push(...mapLibraries(client.libraries));
  artifacts.push(mapAssetIndex(client.assetIndex));
  artifacts.push(...mapAssetObjects(manifest));

  const libPaths = client.libraries.map((l) => ({
    rules: l.rules,
    artifactPath: `\${library_directory}/${l.artifact.path}`,
  }));

  const classpath = buildClasspath(libPaths, '\${version_dir}/client.jar');

  const vars: ValDefs = {
    root: '.',
    launcher_name: 'torba',
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
    classpath_separator: [
      { value: ';', rules: allowOsRuleset('windows') },
      { value: ':', rules: allowOsRuleset('linux') },
      { value: ':', rules: allowOsRuleset('osx') },
    ],
    classpath,
  };

  const parts = buildLaunch(
    client.mainClass,
    client.args.game,
    client.args.jvm,
  );

  return { artifacts, vars, classpath, ...parts };
}
