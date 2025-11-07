import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	mode: "with-specified-env",
	plugins: [cloudflare({ inspectorPort: false, persistState: false })],
});
