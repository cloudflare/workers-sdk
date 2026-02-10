import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./wrangler.jsonc",
			inspectorPort: false,
			remoteBindings: false,
			persistState: false,
		}),
	],
});
