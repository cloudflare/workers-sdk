import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
    })],

    test: {
        deps: {
			optimizer: {
				ssr: {
					enabled: true,
					include: ["discord-api-types/v10", "@microlabs/otel-cf-workers"],
				},
			},
		}
    }
});