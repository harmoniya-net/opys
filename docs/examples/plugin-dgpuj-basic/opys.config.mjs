import { defineConfig, userDataDir } from '@opys/dev';
import { dgpuj, java, minecraft } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [minecraft({ version: '1.21.1' }), java({ version: '21' }), dgpuj()],
  manifest: {
    command: '@dgpuj.bin',
    args: [
      '--dgpuj-home',
      '@java.home',
      '@minecraft.jvmArgs',
      '@minecraft.mainClass',
      '@minecraft.gameArgs',
    ],
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
