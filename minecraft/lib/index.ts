// Plugin factories — the @lanka/minecraft domain surface.
export {
  minecraft,
  forge,
  cleanroom,
  lwjgl3ify,
  authliberty,
  curseforge,
  type CurseforgePluginOptions,
} from './plugins';

// Helpers (not plugins).
export {
  resolveBifrost as bifrost,
  type BifrostOptions,
  type BifrostAuth,
} from './bifrost';
export {
  resolveServerlist,
  type ServerEntry,
  type ServerlistOptions,
} from './serverlist';

// Option / template types for advanced use.
export type { MinecraftTemplate } from './template';
export type { ForgeOptions, ForgeWrapperOptions } from './forge/index';
export type { CleanroomOptions } from './cleanroom/index';
export type { Lwjgl3ifyOptions } from './lwjgl3ify/index';
export type {
  AuthLibertyOptions,
  AuthLibertyHosts,
  AuthLibertyHostMap,
} from './authliberty/index';
export type {
  CurseForgeOptions,
  CurseForgeFileRef,
  CurseForgePath,
} from './curseforge/index';
