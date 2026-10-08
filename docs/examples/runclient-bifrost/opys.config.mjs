import { defineConfig, userDataDir } from '@opys/dev';
import { java, minecraft, resolveBifrost } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [minecraft('1.21.1'), java('21')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ minecraft }) => [
      minecraft.jvmArgs,
      minecraft.mainClass,
      minecraft.gameArgs,
    ],
    workdir: '${game_directory}',
  },
  // Runs on every `opys launch` and `opys install` from this config, never on
  // `opys build`, so the signing key is needed only where the game starts.
  runClient: (manifest) => ({
    vars: {
      ...manifest.vars,
      root: userDataDir('my-pack'),
      ...resolveBifrost({
        privateKey: process.env.BIFROST_PRIVATE_KEY,
        username: 'Player',
        uuid: '00000000-0000-0000-0000-000000000001',
      }),
    },
  }),
});
