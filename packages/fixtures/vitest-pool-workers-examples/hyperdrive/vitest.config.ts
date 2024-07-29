import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		globalSetup: ["./global-setup.ts"],
		poolOptions: {
			workers: ({ inject }) => {
				// Provided in `global-setup.ts`
				const echoServerPort = inject("echoServerPort");

				return {
					singleWorker: true,
					miniflare: {
						hyperdrives: {
							ECHO_SERVER_HYPERDRIVE: `postgres://user:pass@127.0.0.1:${echoServerPort}/db`,
						},
					},
					wrangler: {
						configPath: "./wrangler.toml",
					},
				};
			},
		},
	},
});
