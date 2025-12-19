import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest(({ inject }) => {
			// Provided in `global-setup.ts`
			const echoServerPort = inject("echoServerPort");

			return {
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
