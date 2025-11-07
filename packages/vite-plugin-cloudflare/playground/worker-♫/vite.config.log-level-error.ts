import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	plugins: [cloudflare({ inspectorPort: false, persistState: false })],
	logLevel: "error",
});
