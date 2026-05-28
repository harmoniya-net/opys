// Integration-test fixture config. Lives inside the repo tree so the bare
// `@opys/*` imports resolve against the workspace node_modules.
import { forge } from '@opys/minecraft';
import { java } from '@opys/java';

export default {
  plugins: [forge('1.20.1-best'), java('17')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ forge }) => [forge.jvmArgs, forge.mainClass, forge.gameArgs],
    workdir: '${game_directory}',
  },
};
