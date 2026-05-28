import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['bin/lanka.ts'],
  format: 'esm',
  outDir: 'dist',
  clean: true,
});
