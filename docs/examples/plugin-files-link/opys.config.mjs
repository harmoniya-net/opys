import { defineConfig, userDataDir } from '@opys/dev';
import { fabric, java, links } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    fabric({ version: '1.21.1' }),
    java({ version: '21' }),
    links({
      to: (file) => '${game_directory}/mods/' + file.filename,
      links: [
        'https://modrinth.com/mod/sodium/version/SMxNOGZ6',
        'https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/0.116.0+1.21.1/fabric-api-0.116.0+1.21.1.jar',
      ],
    }),
  ],
  manifest: {
    command: '@fabric.command',
    args: ['@fabric.jvmArgs', '@fabric.mainClass', '@fabric.gameArgs'],
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
