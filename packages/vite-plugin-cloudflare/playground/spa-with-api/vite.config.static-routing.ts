import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		react(),
		cloudflare({
			types: { includeRuntime: false },
			config: { assets: { runWorkerFirst: ["/api/*", "!/api/asset.txt"] } },
			inspectorPort: false,
			persistState: false,
		}),
	],
});
