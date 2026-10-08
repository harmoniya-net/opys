import { defineConfig, files, userDataDir } from '@opys/dev';
import { java, minecraft } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    minecraft('1.21.1'),
    java('21'),
    files({ from: 'config', to: '${game_directory}/config/${rel}' }),
  ],
  manifest: {
    command: '@java.bin',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
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
