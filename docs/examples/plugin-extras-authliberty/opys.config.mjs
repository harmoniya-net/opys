import { defineConfig, userDataDir } from '@opys/dev';
import { authliberty, java, minecraft } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    minecraft({ version: '1.21.1' }),
    authliberty({
      version: 'latest',
      hosts: {
        auth: 'https://auth.example.com/authserver',
        session: 'https://auth.example.com/sessionserver',
        services: 'https://auth.example.com/services',
      },
    }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: [
      '@authliberty.jvmArgs',
      '@minecraft.jvmArgs',
      '@minecraft.mainClass',
      '@minecraft.gameArgs',
    ],
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
