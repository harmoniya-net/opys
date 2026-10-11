import { defineConfig, files, userDataDir } from '@opys/dev';
import { fabric, java, modrinth } from '@opys/minecraft';

export default defineConfig(({ mode }) => {
  const dev = mode === 'dev';

  return {
    output: dev ? 'pack-dev.opys' : 'pack.opys',

    plugins: [
      fabric({ version: '1.21.1' }),
      java({ version: '21' }),

      // Mods published on Modrinth, pinned by hash at build time.
      modrinth({
        to: (file) => '${game_directory}/mods/' + file.filename,
        versions: [
          'JjCVwmVA', // Sodium
          'N08Z8wog', // Lithium
        ],
      }).addRule('**/sodium-*.jar', 'disallow.os.osx'),

      // Our own files, carried inside the bundle.
      files({
        from: 'config',
        to: (file) => '${game_directory}/config/' + file.rel,
      }),
    ],

    manifest: {
      command: '@fabric.command',
      args: [
        '@fabric.jvmArgs',
        dev ? '-Xmx2G' : '-Xmx4G',
        '@fabric.mainClass',
        '@fabric.gameArgs',
      ],
      workdir: '${game_directory}',

      vars: { pack_version: '1.4.0' },
      envs: { PACK_VERSION: '${pack_version}' },

      // A mod dropped from the list above is deleted from players' disks.
      cleanup: [{ includes: ['${game_directory}/mods/*.jar'] }],
    },

    // Runs on the player's machine, every launch. Never baked into the bundle.
    run: (manifest) => ({
      manifest: {
        vars: {
          ...manifest.vars,
          root: userDataDir(dev ? 'my-pack-dev' : 'my-pack'),
          username: 'Player',
          uuid: '00000000-0000-0000-0000-000000000001',
          token: '0',
        },
      },
    }),
  };
});
