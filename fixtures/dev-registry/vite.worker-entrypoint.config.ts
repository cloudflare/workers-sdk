import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./wrangler.worker-entrypoint.jsonc",
			inspectorPort: false,
			persistState: false,
			auxiliaryWorkers: [
				{
					configPath: "./wrangler.internal-durable-object.jsonc",
				},
			],
		}),
	],
});
