import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	server: {
		fs: {
			deny: ["custom-sensitive-file"],
		},
	},
	plugins: [cloudflare({ inspectorPort: false, persistState: false })],
});
