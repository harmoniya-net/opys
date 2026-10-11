import { defineConfig, userDataDir } from '@opys/dev';
import { java, minecraft, serverlist } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
    serverlist({
      servers: [
        { name: 'My SMP', ip: 'mc.example.com' },
        { name: 'Friends', ip: 'friends.example.com:25566' },
      ],
    }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
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
