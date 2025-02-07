import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		deps: {
			optimizer: {
				ssr: {
					enabled: true,
					include: ["discord-api-types/v10", "@microlabs/otel-cf-workers"],
				},
			},
		},
		poolOptions: {
			workers: {
				wrangler: { configPath: "./wrangler.toml" },
			},
		},
	},
});
