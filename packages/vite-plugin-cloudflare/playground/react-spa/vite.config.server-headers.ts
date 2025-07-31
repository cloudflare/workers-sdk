import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	server: {
		headers: {
			"custom-header": "custom-value",
		},
	},
	plugins: [react(), cloudflare({ inspectorPort: false, persistState: false })],
});
