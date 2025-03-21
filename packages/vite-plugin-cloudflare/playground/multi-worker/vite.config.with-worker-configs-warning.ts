import { defineConfig } from "vite";
import { cloudflare } from "../__test-utils__/plugin";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./worker-a/wrangler.with-warning.toml",
			auxiliaryWorkers: [
				{ configPath: "./worker-b/wrangler.with-warning.toml" },
			],
		}),
	],
});
