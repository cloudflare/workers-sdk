import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: defineWorkersPoolOptions({
        wrangler: { configPath: "./wrangler.toml" },
      }),
    },
  },
});
