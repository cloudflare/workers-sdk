import { defineWorkspace, configDefaults } from 'vitest/config'


// Vitest supports monorepo workspaces, merging configs in packages and more: https://vitest.dev/guide/workspace.html
export default defineWorkspace(['packages/*',
  'fixtures/*', {
    test: {
      include:
        __dirname === process.cwd()
          ? [
            "{fixtures,packages/workers.new}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
          ]
          : configDefaults.include,
      exclude: [...configDefaults.exclude],
      root: __dirname,
      testTimeout: 30_000,
    },
  }]);

