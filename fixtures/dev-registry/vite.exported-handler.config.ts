import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./wrangler.exported-handler.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
