import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['bin/opys.ts'],
  format: 'esm',
  outDir: 'dist',
  clean: true,
});
