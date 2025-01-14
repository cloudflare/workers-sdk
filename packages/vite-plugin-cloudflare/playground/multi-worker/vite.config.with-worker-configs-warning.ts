import { cloudflare } from "@flarelabs-net/vite-plugin-cloudflare";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./worker-a/wrangler.with-warning.toml",
			auxiliaryWorkers: [
				{ configPath: "./worker-b/wrangler.with-warning.toml" },
			],
			persistState: false,
		}),
	],
});
