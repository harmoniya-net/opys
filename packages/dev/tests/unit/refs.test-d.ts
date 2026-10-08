import { defineConfig, definePlugin, type OpysPlugin } from '../../lib';

const loader = definePlugin({
  name: 'forge',
  build: () => ({ launch: { jvmArgs: ['-Xss1M'], mainClass: 'Main' } }),
});
const jdk = definePlugin<'java', 'bin'>({ name: 'java', build: () => ({}) });
const mods = definePlugin({ name: 'mods', build: () => ({ artifacts: [] }) });
declare const untyped: OpysPlugin;
declare const dev: boolean;
declare const elsewhere: string[];

defineConfig({
  plugins: [loader, jdk, mods],
  manifest: {
    command: '@java.bin',
    args: [
      '@forge.jvmArgs',
      '-Xmx4G',
      '\\@file',
      '@forge.mainClass',
      { value: '@x' },
    ],
    workdir: '${game_directory}',
  },
});

defineConfig({
  plugins: [loader, jdk],
  // @ts-expect-error a group the plugin does not expose
  manifest: { command: '@java.bin', args: ['@forge.jvmArg'] },
});
defineConfig({
  plugins: [loader, jdk],
  // @ts-expect-error a plugin that is not in the list
  manifest: { command: '@jav.bin', args: [] },
});
defineConfig({
  plugins: [loader, mods],
  // @ts-expect-error a plugin that exposes nothing
  manifest: { command: 'java', args: ['@mods.jvmArgs'] },
});
defineConfig({
  plugins: [loader, jdk],
  // @ts-expect-error workdir is checked like command
  manifest: { command: 'java', args: [], workdir: '@forge.dir' },
});

// A renamed plugin is referenced by its new name, and no longer by the old.
defineConfig({
  plugins: [loader.as('base'), jdk],
  manifest: { command: '@java.bin', args: ['@base.jvmArgs'] },
});
defineConfig({
  plugins: [loader.as('base').exclude('**'), jdk],
  // @ts-expect-error the old name is gone
  manifest: { command: '@java.bin', args: ['@forge.jvmArgs'] },
});

// The function form, and a plugin that is only sometimes there.
defineConfig(({ mode }) => ({
  plugins: [loader, jdk, ...(mode === 'dev' || dev ? [mods.as('extra')] : [])],
  manifest: { command: '@java.bin', args: ['@forge.jvmArgs', mode] },
}));
// @ts-expect-error checked inside the function form too
defineConfig(() => ({
  plugins: [loader, jdk],
  manifest: { command: '@java.bin', args: ['@forge.nope'] },
}));

// What the compiler cannot see is left to the build: a plugin of unknown
// shape, and strings from somewhere else.
defineConfig({
  plugins: [untyped],
  manifest: { command: '@anything.at', args: ['@all.here'] },
});
defineConfig({
  plugins: [loader, jdk],
  manifest: { command: '@java.bin', args: elsewhere },
});
