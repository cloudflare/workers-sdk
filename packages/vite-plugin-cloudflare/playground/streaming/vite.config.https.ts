import { cloudflare } from "@cloudflare/vite-plugin";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({ inspectorPort: false, persistState: false }),
		basicSsl(),
	],
});
