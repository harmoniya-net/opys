import { defineConfig, userDataDir } from '@opys/dev';
import { lwjgl3ify, java } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [lwjgl3ify('1.7.10'), java('25')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ lwjgl3ify }) => [
      lwjgl3ify.jvmArgs,
      lwjgl3ify.mainClass,
      lwjgl3ify.gameArgs,
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
