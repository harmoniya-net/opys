import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['bin/torba.ts'],
  format: 'esm',
  outDir: 'dist',
  clean: true,
});
