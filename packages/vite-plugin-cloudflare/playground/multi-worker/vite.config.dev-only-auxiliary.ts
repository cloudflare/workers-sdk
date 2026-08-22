import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "custom-dev-only-directory",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			auxiliaryWorkers: { auxiliaryWorker: { devOnly: true } },
			inspectorPort: false,
			persistState: false,
		}),
	],
});
