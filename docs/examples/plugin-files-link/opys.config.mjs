import { defineConfig, userDataDir } from '@opys/dev';
import { fabric, java, links } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    fabric('1.21.1'),
    java('21'),
    links({
      path: (file) => '${game_directory}/mods/' + file.filename,
      links: [
        'https://modrinth.com/mod/sodium/version/SMxNOGZ6',
        'https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/0.116.0+1.21.1/fabric-api-0.116.0+1.21.1.jar',
      ],
    }),
  ],
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
