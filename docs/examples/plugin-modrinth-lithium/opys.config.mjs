import { defineConfig, userDataDir } from '@opys/dev';
import { fabric, java, modrinth } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    fabric('1.21.1'),
    java('21'),
    modrinth({
      path: (info) => '${game_directory}/mods/' + info.filename,
      versions: [
        // Lithium 0.15.4 for Fabric 1.21.1, by version id.
        'N08Z8wog',
      ],
    }),
  ],
  manifest: {
    command: '@java.bin',
    args: ['@fabric.jvmArgs', '@fabric.mainClass', '@fabric.gameArgs'],
    workdir: '${game_directory}',
  },
  run: (manifest) => ({
    vars: {
      ...manifest.vars,
      root: userDataDir('my-pack'),
      username: 'Player',
      uuid: '00000000-0000-0000-0000-000000000001',
      token: '0',
    },
  }),
});
