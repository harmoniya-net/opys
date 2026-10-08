import { defineConfig, userDataDir } from '@opys/dev';
import { cleanroom, java } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [cleanroom('1.12.2'), java('25')],
  manifest: {
    command: '@java.bin',
    args: ['@cleanroom.jvmArgs', '@cleanroom.mainClass', '@cleanroom.gameArgs'],
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
