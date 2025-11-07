import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	base: "/custom-mount",
	plugins: [cloudflare({ inspectorPort: false, persistState: false })],
});
