import { defineConfig } from "vitest/config";
export default defineConfig({
    test: {
        include: ["*.test.ts"],
        cache: false,
        root: ".",
        testTimeout: 1000 * 60 * 10, // 10 min for lengthy installs
        maxConcurrency: 3,
        globalSetup: ["global-setup.ts"],
        reporters: ["dot", "hanging-process"],
    },
});
