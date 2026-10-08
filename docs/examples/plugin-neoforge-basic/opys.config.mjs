import { defineConfig, userDataDir } from '@opys/dev';
import { java, neoforge } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [neoforge('1.21.1'), java('21')],
  manifest: {
    command: '@java.bin',
    args: ['@neoforge.jvmArgs', '@neoforge.mainClass', '@neoforge.gameArgs'],
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
