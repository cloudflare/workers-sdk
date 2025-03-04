import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	builder: {
		async buildApp(builder) {
			const workerEnvironment = builder.environments.worker;

			if (workerEnvironment) {
				builder.config.logger.info("__before-build__");
				await builder.build(workerEnvironment);
				builder.config.logger.info("__after-build__");
			}
		},
	},
	plugins: [cloudflare({ persistState: false })],
});
