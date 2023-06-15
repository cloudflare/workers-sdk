import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "wrangler-tests",
    reporters: [
      "json",
      "html",
      "text",
      "cobertura"
    ],
    alias: {
      "clipboardy": "<rootDir>/src/__tests__/helpers/clipboardy-mock.js",
      "miniflare/cli": "<rootDir>/../../node_modules/miniflare/dist/src/cli.js"
    },
    restoreMocks: true,
    setupFiles: [
      "./src/__tests__/vitest.setup.ts"
    ],
    testNamePattern: ".*\\.(test|spec)\\.[jt]sx?$",
    testTimeout: 30000
  }
})