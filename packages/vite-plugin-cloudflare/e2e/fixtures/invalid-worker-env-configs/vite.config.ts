import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			inspectorPort: false,
			persistState: false,
			viteEnvironment: { name: "worker" },
		}),
	],
	environments: {
		worker: {
			optimizeDeps: {
				exclude: ["pkg"],
			},
		},
	},
});
