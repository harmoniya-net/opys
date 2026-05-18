import { definePlugin, type TorbaPlugin, type LaunchGroups } from '@torba/dev';
import type { Launch, Val, Valset } from '@torba/core';
import { resolveMinecraft } from './template';
import { resolveForge, type ForgeOptions } from './forge/index';
import { resolveCleanroom, type CleanroomOptions } from './cleanroom/index';
import { resolveLwjgl3ify, type Lwjgl3ifyOptions } from './lwjgl3ify/index';
import {
  resolveAuthliberty,
  type AuthLibertyOptions,
} from './authliberty/index';
import {
  resolveCurseforge,
  type CurseForgeOptions,
  type CurseForgeFileRef,
} from './curseforge/index';

/** Shared shape of the vanilla / forge-family loader templates. */
interface LoaderTemplate {
  launch: Launch;
  jvmArgs: Valset;
  mainClass: Val;
  gameArgs: Valset;
}

/** Project a loader template's launch surface into named groups. */
function launchGroups(t: LoaderTemplate): LaunchGroups {
  return {
    command: t.launch.command,
    jvmArgs: t.jvmArgs,
    mainClass: t.mainClass,
    gameArgs: t.gameArgs,
  };
}

/** Vanilla Minecraft client + libraries + assets. */
export function minecraft(version?: string): TorbaPlugin {
  return definePlugin({
    name: 'minecraft',
    async build(ctx) {
      const t = await resolveMinecraft(version ? { version } : {});
      ctx.log('minecraft', `vanilla ${version ?? 'latest'}`);
      return { artifacts: t.artifacts, vars: t.vars, launch: launchGroups(t) };
    },
  });
}

/** Forge mod loader (1.7–1.12 legacy + 1.13+ processor eras). */
export function forge(
  version: string,
  opts: Omit<ForgeOptions, 'version'> = {},
): TorbaPlugin {
  return definePlugin({
    name: 'forge',
    async build(ctx) {
      const t = await resolveForge({ version, ...opts });
      ctx.log('forge', `resolved ${version}`);
      return { artifacts: t.artifacts, vars: t.vars, launch: launchGroups(t) };
    },
  });
}

/** Cleanroom — a 1.12.2 Forge variant. */
export function cleanroom(
  version: string,
  opts: Omit<CleanroomOptions, 'version'> = {},
): TorbaPlugin {
  return definePlugin({
    name: 'cleanroom',
    async build(ctx) {
      const t = await resolveCleanroom({ version, ...opts });
      ctx.log('cleanroom', `resolved ${version}`);
      return { artifacts: t.artifacts, vars: t.vars, launch: launchGroups(t) };
    },
  });
}

/** lwjgl3ify — a 1.7.10 Forge variant on a modern LWJGL3 runtime. */
export function lwjgl3ify(
  version: string,
  opts: Omit<Lwjgl3ifyOptions, 'version'> = {},
): TorbaPlugin {
  return definePlugin({
    name: 'lwjgl3ify',
    async build(ctx) {
      const t = await resolveLwjgl3ify({ version, ...opts });
      ctx.log('lwjgl3ify', `resolved ${version}`);
      return { artifacts: t.artifacts, vars: t.vars, launch: launchGroups(t) };
    },
  });
}

/** AuthLiberty — an authlib-injector `-javaagent` auth redirector. */
export function authliberty(
  version: string,
  opts: Omit<AuthLibertyOptions, 'version'> = {},
): TorbaPlugin {
  return definePlugin({
    name: 'authliberty',
    async build(ctx) {
      const t = await resolveAuthliberty({ version, ...opts });
      ctx.log('authliberty', `resolved ${version}`);
      return { artifacts: t.artifacts, launch: { jvmArgs: t.jvmArgs } };
    },
  });
}

/** Options for the {@link curseforge} plugin. */
export interface CurseforgePluginOptions extends CurseForgeOptions {
  /** CurseForge file references — numeric IDs or `/files/<id>` URLs. */
  files: CurseForgeFileRef[];
}

/** Mod files resolved from the CurseForge API. */
export function curseforge(options: CurseforgePluginOptions): TorbaPlugin {
  return definePlugin({
    name: 'curseforge',
    async build(ctx) {
      const { files, ...rest } = options;
      const artifacts = await resolveCurseforge(rest, files);
      ctx.log('curseforge', `${artifacts.length} file(s)`);
      return { artifacts };
    },
  });
}
