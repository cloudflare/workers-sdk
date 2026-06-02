import { cloudflare } from "@cloudflare/rsbuild-plugin-workers";
import { defineConfig } from "@rsbuild/core";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "wrangler.json",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
