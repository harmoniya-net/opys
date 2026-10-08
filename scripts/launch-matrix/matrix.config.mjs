// One config for every case of the launch matrix; the case comes from env.
//   LOADER=minecraft|forge|neoforge|fabric|cleanroom|lwjgl3ify  VERSION=…  JAVA=<major>
import { defineConfig } from '@opys/dev';
import * as mc from '@opys/minecraft';

const { LOADER, VERSION, JAVA, JAVA_VENDOR } = process.env;

export default defineConfig({
  plugins: [
    mc[LOADER](VERSION),
    mc.java(JAVA, { vendor: JAVA_VENDOR || 'temurin' }),
  ],
  manifest: {
    command: '@java.bin',
    args: [`@${LOADER}.jvmArgs`, `@${LOADER}.mainClass`, `@${LOADER}.gameArgs`],
    workdir: '${game_directory}',
  },
});
