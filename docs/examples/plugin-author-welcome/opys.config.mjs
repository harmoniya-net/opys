import { defineConfig, definePlugin, userDataDir } from '@opys/dev';
import { java, minecraft } from '@opys/minecraft';

// A plugin is { name, build(ctx) }. Calling welcome() does no I/O; the work
// happens in build(), which the engine runs once per `opys build`.
const welcome = (motd) =>
  definePlugin({
    name: 'welcome',
    build(ctx) {
      ctx.log('welcome', `motd is "${motd}"`);

      // A generated file. It is carried in the bundle: the build names it by
      // its content, so there is nothing to hash or keep track of here.
      const config = new TextEncoder().encode(`motd = "${motd}"\n`);

      return {
        vars: { motd },
        artifacts: [
          {
            path: '${root}/downloads/brigadier-1.3.10.jar',
            source: {
              url: 'https://libraries.minecraft.net/com/mojang/brigadier/1.3.10/brigadier-1.3.10.jar',
            },
            size: 80082,
            integrity: { sha1: 'd15b53a14cf20fdcaa98f731af5dda654452c010' },
          },
          { path: '${root}/config/welcome.toml', source: { bytes: config } },
        ],
        launch: { jvmArg: '-Dwelcome.motd=${motd}' },
      };
    },
  });

export default defineConfig({
  output: 'game.opys',
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
    welcome('Hello from opys'),
  ],
  manifest: {
    command: '@minecraft.command',
    args: [
      '@welcome.jvmArg',
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
