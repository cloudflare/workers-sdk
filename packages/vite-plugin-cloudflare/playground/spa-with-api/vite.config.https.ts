import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [
		react(),
		cloudflare({ inspectorPort: false, persistState: false }),
		basicSsl(),
	],
});
