import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	mode: "custom-mode",
	plugins: [cloudflare({ inspectorPort: false, persistState: false })],
});
