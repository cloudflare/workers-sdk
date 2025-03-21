import { defineConfig } from "vite";
import { cloudflare } from "../__test-utils__/plugin";

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
	plugins: [cloudflare()],
});
