import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['bin/unifest.ts'],
  format: 'esm',
  outDir: 'dist',
  clean: true,
});
