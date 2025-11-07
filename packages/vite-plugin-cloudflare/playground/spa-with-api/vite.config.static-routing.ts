import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [
		react(),
		cloudflare({
			configPath: "./wrangler.static-routing.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
