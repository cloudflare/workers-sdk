import assert from "node:assert";
import { defineConfig } from "vite";
import baseConfig from "./vite.config";

export default defineConfig({
	...baseConfig,
	builder: {
		async buildApp(builder) {
			const clientEnvironment = builder.environments.client;
			assert(clientEnvironment, 'No "client" environment');
			await builder.build(clientEnvironment);
		},
	},
});
