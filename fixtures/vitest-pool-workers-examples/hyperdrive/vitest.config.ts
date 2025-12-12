import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest(function ({ inject }) {
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
					configPath: "./wrangler.jsonc",
				},
			};
		}),
	],

	test: {
		globalSetup: ["./global-setup.ts"],
	},
});
