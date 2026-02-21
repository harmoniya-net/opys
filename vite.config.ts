/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { defineConfig, type UserConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(({ mode }) => {
  const isLibrary = mode === 'library';
  const pkgDir = process.cwd();

  const config: UserConfig = {
    test: {
      includeSource: ['rules/lib/**/*.{js,ts}', 'common/lib/**/*.{js,ts}'],
    },
    define: {
      'import.meta.vitest': 'undefined',
    },
  };

  if (isLibrary) {
    return {
      ...config,
      build: {
        lib: {
          entry: resolve(pkgDir, 'lib/index.ts'),
          formats: ['es', 'cjs'],
          fileName: 'index',
        },
        rollupOptions: {
          external: [/^effect/, /^effect\/.*/],
        },
        outDir: 'dist',
        emptyOutDir: true,
      },
      plugins: [
        dts({
          rollupTypes: true,
          tsconfigPath: resolve(pkgDir, 'tsconfig.json'),
        }),
      ],
    };
  }

  return config;
});
