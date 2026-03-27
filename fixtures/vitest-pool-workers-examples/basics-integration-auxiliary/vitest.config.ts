import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			miniflare: {
				// Configuration for the test runner Worker
				compatibilityDate: "2024-01-01",
				compatibilityFlags: [
					// This illustrates a Worker that in production only wants v1 of Node.js compatibility.
					// The Vitest pool integration will need to remove this flag since the `MockAgent` requires v2.
					"no_nodejs_compat_v2",
					"nodejs_compat",
					// Required to use `WORKER.scheduled()`. This is an experimental
					// compatibility flag, and cannot be enabled in production.
					"service_binding_extra_handlers",
				],
				serviceBindings: {
					WORKER: "basics-integration-auxiliary",
				},

				workers: [
					// Configuration for the "auxiliary" Worker under test.
					// This loads configuration from the `wrangler.jsonc` file and
					// automatically builds the TypeScript entrypoint.
					{
						wrangler: { configPath: "./wrangler.jsonc" },
					},
				],
			},
		}),
	],
});
