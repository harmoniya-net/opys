import { defineConfig, userDataDir } from '@opys/dev';
import { java, minecraft } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [minecraft('1.21.1'), java('21')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ minecraft }) => [
      minecraft.jvmArgs,
      minecraft.mainClass,
      minecraft.gameArgs,
    ],
    workdir: '${game_directory}',
  },
  runClient: (manifest) => ({
    vars: {
      ...manifest.vars,
      root: userDataDir('my-pack'),
      username: 'Player',
      uuid: '00000000-0000-0000-0000-000000000001',
      token: '0',
    },
  }),
});
