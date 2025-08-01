import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	server: {
		headers: {
			"custom-string": "string-value",
			"custom-string-array": ["one", "two", "three"],
			"custom-number": 123,
		},
	},
	plugins: [react(), cloudflare({ inspectorPort: false, persistState: false })],
});
