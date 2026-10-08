import { defineConfig, userDataDir } from '@opys/dev';
import { fabric, java } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [fabric('1.21.4'), java('21')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ fabric }) => [fabric.jvmArgs, fabric.mainClass, fabric.gameArgs],
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
