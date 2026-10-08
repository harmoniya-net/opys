// Integration-test fixture config. Lives inside the repo tree so the bare
// `@opys/*` imports resolve against the workspace node_modules.
import { forge, java } from '@opys/minecraft';

export default {
  plugins: [forge({ version: '1.20.1-best' }), java({ version: '17' })],
  manifest: {
    command: '@forge.command',
    args: ['@forge.jvmArgs', '@forge.mainClass', '@forge.gameArgs'],
    workdir: '${game_directory}',
  },
};
