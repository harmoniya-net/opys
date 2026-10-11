import { defineConfig, userDataDir } from '@opys/dev';
import { cleanroom, java } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [cleanroom({ version: '1.12.2' }), java({ version: '25' })],
  manifest: {
    command: '@cleanroom.command',
    args: ['@cleanroom.jvmArgs', '@cleanroom.mainClass', '@cleanroom.gameArgs'],
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
