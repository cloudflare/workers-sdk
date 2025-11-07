import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
	plugins: [
		cloudflare({ inspectorPort: false, persistState: false }),
		basicSsl(),
	],
});
