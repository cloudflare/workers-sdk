import assert from "node:assert";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	builder: {
		async buildApp(builder) {
			const workerEnvironment = builder.environments.worker;
			const clientEnvironment = builder.environments.client;

			assert(workerEnvironment, `No "worker" environment`);
			assert(clientEnvironment, `No "client" environment`);

			builder.config.logger.info("__before-build__");
			await builder.build(workerEnvironment);
			// Some plugins build the Worker environment twice so we do that here to test this scenario
			await builder.build(workerEnvironment);
			builder.config.logger.info("__after-build__");

			await builder.build(clientEnvironment);

			// The output `wrangler.json` will always include an `assets` field so will fail to run if there is no client build.
			// To build correctly without assets, a custom `buildApp` would need to remove this field.
		},
	},
	plugins: [cloudflare({ inspectorPort: false, persistState: false })],
});
