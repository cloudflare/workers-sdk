import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/worker-default-compat",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-default-compat/wrangler.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
