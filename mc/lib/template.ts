import {
  Extract,
  ExtractDump,
  Integrity,
  Launch,
  Source,
  Unifact,
  UnifactSize,
  Unifest,
  ValDef,
  ValDefs,
} from '@unifest/core';
import { RuleOsName, Ruleset, Val, Valset } from '@unifest/rules';
import { AssetManifest } from '@unifest/minecraft';
import { Client } from '@unifest/minecraft';
import { Library } from '@unifest/minecraft';
import {
  VersionManifest,
  VersionFetchError,
  type Version,
} from '@unifest/minecraft';

function libraryToUnifact(lib: Library): Unifact {
  const path = `\${library_directory}/${lib.artifact.path}`;

  const extract = lib.native
    ? new Extract([
        new ExtractDump('\${natives_directory}', undefined, undefined, true),
      ])
    : undefined;

  return new Unifact(
    path,
    Source.url(lib.artifact.url),
    UnifactSize.exact(lib.artifact.size),
    lib.rules,
    Integrity.sha1(lib.artifact.sha1),
    undefined,
    extract,
  );
}

export async function minecraftTemplate(client: Client): Promise<Unifest> {
  const assetRes = await fetch(client.assetIndex.url);
  if (!assetRes.ok)
    throw new VersionFetchError(
      client.assetIndex.url,
      assetRes.status,
      `Failed to fetch asset manifest: HTTP ${assetRes.status}`,
    );
  const assetManifest = AssetManifest.CODEC.decode(await assetRes.json());

  const unifacts: Unifact[] = [];

  unifacts.push(
    new Unifact(
      '\${version_dir}/client.jar',
      Source.url(client.downloads.client.url),
      UnifactSize.exact(client.downloads.client.size),
      Ruleset.empty(),
      Integrity.sha1(client.downloads.client.sha1),
      undefined,
      undefined,
    ),
  );

  const libraries = Array.from(client.libraries).map(libraryToUnifact);
  unifacts.push(...libraries);

  unifacts.push(
    new Unifact(
      `\${assets_root}/indexes/${client.assetIndex.id}.json`,
      Source.url(client.assetIndex.url),
      UnifactSize.exact(client.assetIndex.size),
      Ruleset.empty(),
      Integrity.sha1(client.assetIndex.sha1),
      undefined,
      undefined,
    ),
  );

  for (const obj of Object.values(assetManifest.objects)) {
    unifacts.push(
      new Unifact(
        `\${assets_root}/objects/${obj.path()}`,
        Source.url(obj.url()),
        UnifactSize.exact(obj.size),
        Ruleset.empty(),
        Integrity.skip(),
        undefined,
        undefined,
      ),
    );
  }

  const osPlatforms: Array<{
    osEnum: RuleOsName;
    opts: { name: string; version: string; arch: string };
  }> = [
    {
      osEnum: RuleOsName.Linux,
      opts: { name: 'linux', version: '', arch: 'x86_64' },
    },
    {
      osEnum: RuleOsName.Osx,
      opts: { name: 'osx', version: '', arch: 'x86_64' },
    },
    {
      osEnum: RuleOsName.Windows,
      opts: { name: 'windows', version: '', arch: 'x86_64' },
    },
  ];

  const classpathEntries: [string, ValDef][] = [];
  for (const { osEnum, opts } of osPlatforms) {
    const applicablePaths = Array.from(client.libraries)
      .filter((lib) => lib.rules.length === 0 || lib.rules.satisfies(opts))
      .map((lib) => `\${library_directory}/${lib.artifact.path}`);
    const value = ['\${version_dir}/client.jar', ...applicablePaths].join(
      '\${classpath_separator}',
    );
    classpathEntries.push([
      'classpath',
      new ValDef(value, Ruleset.allowOs(osEnum)),
    ]);
  }

  const vars = new ValDefs([
    ['root', new ValDef('.', Ruleset.empty())],
    ['launcher_name', new ValDef('Unifest Launcher', Ruleset.empty())],
    ['launcher_version', new ValDef('0.1', Ruleset.empty())],
    ['version_type', new ValDef(client.metadata.type, Ruleset.empty())],
    ['version_name', new ValDef(client.id, Ruleset.empty())],
    ['game_directory', new ValDef('\${root}/', Ruleset.empty())],
    ['assets_root', new ValDef('\${root}/assets', Ruleset.empty())],
    ['game_assets', new ValDef('\${assets_root}', Ruleset.empty())],
    ['assets_index_name', new ValDef(client.assetIndex.id, Ruleset.empty())],
    [
      'version_dir',
      new ValDef('\${root}/versions/\${version_name}', Ruleset.empty()),
    ],
    ['library_directory', new ValDef('\${root}/libraries', Ruleset.empty())],
    [
      'natives_directory',
      new ValDef('\${version_dir}/natives', Ruleset.empty()),
    ],
    ['auth_player_name', new ValDef('\${username}', Ruleset.empty())],
    ['auth_uuid', new ValDef('\${uuid}', Ruleset.empty())],
    ['auth_session', new ValDef('\${token}', Ruleset.empty())],
    ['auth_access_token', new ValDef('\${token}', Ruleset.empty())],
    ['user_type', new ValDef('legacy', Ruleset.empty())],
    ['user_properties', new ValDef('{}', Ruleset.empty())],
    ['clientid', new ValDef('', Ruleset.empty())],
    [
      'classpath_separator',
      new ValDef(';', Ruleset.allowOs(RuleOsName.Windows)),
    ],
    ['classpath_separator', new ValDef(':', Ruleset.allowOs(RuleOsName.Linux))],
    ['classpath_separator', new ValDef(':', Ruleset.allowOs(RuleOsName.Osx))],
    ...classpathEntries,
  ]);

  const allArgs = new Valset([
    ...client.args.jvm,
    Val.CODEC.decode(client.mainClass),
    ...client.args.game,
  ]);

  const launch = new Launch('java', './', allArgs, new ValDefs([]));

  return new Unifest(vars, launch, unifacts);
}

export interface MinecraftTemplate {
  artifacts: Unifact[];
  vars: ValDefs;
  command: Launch;
}

/**
 * Fetch a Minecraft version and return its artifacts, manifest vars, and JVM command.
 * Pass `artifacts` and `command` directly into your `unifestConfig` return value.
 */
export async function minecraft(config?: {
  version?: string;
}): Promise<MinecraftTemplate> {
  const { client } = await fetchClient(config?.version);
  const unifest = await minecraftTemplate(client);
  return {
    artifacts: unifest.unifacts,
    vars: unifest.vars,
    command: unifest.launch!,
  };
}

export async function fetchClient(
  versionId?: string,
): Promise<{ version: Version; client: Client }> {
  const manifest = await VersionManifest.fetch();
  const version = versionId ? manifest.search(versionId) : manifest.latest();
  if (!version) throw new Error(`Version '${versionId ?? 'latest'}' not found`);

  const res = await fetch(version.url);
  if (!res.ok)
    throw new VersionFetchError(
      version.url,
      res.status,
      `Failed to fetch version JSON for ${version.id}: HTTP ${res.status} ${res.statusText}`,
    );

  const client = Client.CODEC.decode(
    (await res.json()) as Parameters<typeof Client.CODEC.decode>[0],
  );
  return { version, client };
}
