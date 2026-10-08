import { defineConfig, userDataDir } from '@opys/dev';
import { java, minecraft, resolveBifrost } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [minecraft({ version: '1.21.1' }), java({ version: '21' })],
  manifest: {
    command: '@minecraft.command',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
    workdir: '${game_directory}',
  },
  run: (manifest) => {
    const auth = resolveBifrost({
      privateKey: process.env.BIFROST_PRIVATE_KEY,
      username: 'Player',
      uuid: '00000000-0000-0000-0000-000000000001',
    });
    return {
      vars: {
        ...manifest.vars,
        root: userDataDir('my-pack'),
        username: auth.username,
        uuid: auth.uuid,
        token: auth.token,
      },
    };
  },
});
