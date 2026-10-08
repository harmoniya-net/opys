import { defineConfig, userDataDir } from '@opys/dev';
import { forge, java } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [forge('1.20.1'), java('17')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ forge }) => [forge.jvmArgs, forge.mainClass, forge.gameArgs],
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
