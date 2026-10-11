import { defineConfig, userDataDir } from '@opys/dev';
import { fabric, java } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [fabric({ version: '1.21.4' }), java({ version: '21' })],
  manifest: {
    command: '@fabric.command',
    args: ['@fabric.jvmArgs', '@fabric.mainClass', '@fabric.gameArgs'],
    workdir: '${game_directory}',
  },
  run: (manifest) => ({
    manifest: {
      vars: {
        ...manifest.vars,
        root: userDataDir('my-pack'),
        username: 'Player',
        uuid: '00000000-0000-0000-0000-000000000001',
        token: '0',
      },
    },
  }),
});
