import { defineConfig, userDataDir } from '@opys/dev';
import { authliberty, java, minecraft } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    minecraft('1.21.1'),
    authliberty('latest', {
      hosts: {
        auth: 'https://auth.example.com/authserver',
        session: 'https://auth.example.com/sessionserver',
        services: 'https://auth.example.com/services',
      },
    }),
    java('21'),
  ],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ authliberty, minecraft }) => [
      authliberty.jvmArgs,
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
