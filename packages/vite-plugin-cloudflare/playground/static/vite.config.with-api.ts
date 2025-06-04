import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./wrangler.with-api.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
