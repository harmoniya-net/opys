import { defineConfig, userDataDir } from '@opys/dev';
import { java, minecraft } from '@opys/minecraft';

export default defineConfig(({ mode }) => ({
  output: 'game.opys',
  plugins: [minecraft('1.21.1'), java('21')],
  manifest: {
    vars: {
      motd: mode === 'release' ? 'Welcome' : 'Development build',
    },
    command: '@java.bin',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
    workdir: '${game_directory}',
    envs: { PACK_NAME: 'config-full' },
    cleanup: [{ includes: ['${game_directory}/mods/*.jar'] }],
  },
  run: (manifest) => ({
    vars: {
      ...manifest.vars,
      root: userDataDir('config-full'),
      username: 'Player',
      uuid: '00000000-0000-0000-0000-000000000001',
      token: '0',
    },
  }),
}));
