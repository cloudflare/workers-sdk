import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	// We should enable `inspectorPort` in this playground when it's possible to do so to verify that there are no port collisions on server restarts
	plugins: [cloudflare({ inspectorPort: false, persistState: false })],
});
