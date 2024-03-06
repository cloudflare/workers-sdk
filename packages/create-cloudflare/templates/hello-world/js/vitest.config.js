import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: defineWorkersPoolOptions({
        isolatedStorage: true,
        wrangler: { configPath: "./wrangler.toml" },
      }),
    },
  },
});
