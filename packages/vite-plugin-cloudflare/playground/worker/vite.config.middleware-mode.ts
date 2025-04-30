import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	server: {
		middlewareMode: true,
	},
	plugins: [cloudflare({ inspectorPort: false, persistState: false })],
});
