import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	experimental: { bundledDev: true },
	plugins: [react(), cloudflare({ inspectorPort: false, persistState: false })],
});
