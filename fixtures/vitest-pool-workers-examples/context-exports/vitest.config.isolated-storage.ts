import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { auxiliaryWorker } from "./vitest.config";

import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [cloudflareTest({
        isolatedStorage: true,
        wrangler: { configPath: "./src/wrangler.jsonc" },
        miniflare: {
            workers: [auxiliaryWorker],
        },
    })],

    test: {
        name: "context-exports-isolated-storage",
        globalSetup: ["./global-setup.ts"]
    }
});