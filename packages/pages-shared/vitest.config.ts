import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    reporters: ['json', 'html', 'text', 'cobertura'],
    restoreMocks: true,
    setupFiles: ['<rootDir>/__tests__/vitest.setup.ts'],
    testNamePattern: '.*.(test|spec)\\.[jt]sx?$',
    testTimeout: 30000,
    exclude: ['**/node_modules/**', '**/dist/**'],
  }
})


