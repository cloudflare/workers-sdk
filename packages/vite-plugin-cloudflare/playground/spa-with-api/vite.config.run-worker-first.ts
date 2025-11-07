import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [
		react(),
		cloudflare({
			configPath: "./wrangler.run-worker-first.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
