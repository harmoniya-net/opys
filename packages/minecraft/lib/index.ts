// `@opys/minecraft` is a meta-package — purely re-exports the split sub-
// packages plus `@opys/java` so consumers can keep using one import.

export * from '@opys/minecraft-vanilla';
export * from '@opys/forge';
export * from '@opys/neoforge';
export * from '@opys/cleanroom';
export * from '@opys/lwjgl3ify';
export * from '@opys/authliberty';
export * from '@opys/curseforge';
export * from '@opys/minecraft-serverlist';
export * from '@opys/java';

// Bifrost keeps its `resolveBifrost` shape for direct callers but is
// also re-exported as `bifrost` for ergonomic parity with the plugin
// factories.
export {
  resolveBifrost,
  resolveBifrost as bifrost,
  type BifrostOptions,
  type BifrostAuth,
} from '@opys/bifrost';
