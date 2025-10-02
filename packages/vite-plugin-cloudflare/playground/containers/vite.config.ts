import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			persistState: false,
			configPath: "entry.wrangler.jsonc",
			auxiliaryWorkers: [{ configPath: "wrangler.jsonc" }],
		}),
	],
});
